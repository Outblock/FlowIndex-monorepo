package api

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// handleApprovalCreate creates a new approval request for a transaction.
// POST /api/v1/wallet/approve (wallet auth)
func (s *Server) handleApprovalCreate(w http.ResponseWriter, r *http.Request) {
	userID := walletUserIDFromContext(r.Context())
	if userID == "" {
		writeAPIError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req struct {
		TxMessageHex  string `json:"tx_message_hex"`
		CadenceScript string `json:"cadence_script"`
		CadenceArgs   string `json:"cadence_args"`
		Description   string `json:"description"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TxMessageHex == "" {
		writeAPIError(w, http.StatusBadRequest, "tx_message_hex is required")
		return
	}

	pool, err := getAdminAuthzDBPool()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "database not available")
		return
	}

	requestID := uuid.New().String()
	expiresAt := time.Now().Add(5 * time.Minute)

	_, err = pool.Exec(r.Context(), `
		INSERT INTO public.wallet_approval_requests
			(id, user_id, tx_message_hex, cadence_script, cadence_args, description, status, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
	`, requestID, userID, req.TxMessageHex, req.CadenceScript, req.CadenceArgs, req.Description, expiresAt)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to create approval request")
		return
	}

	walletAppURL := strings.TrimRight(os.Getenv("WALLET_APP_URL"), "/")
	if walletAppURL == "" {
		walletAppURL = "https://wallet.flowindex.io"
	}
	approveURL := walletAppURL + "/approve/" + requestID

	writeAPIResponse(w, map[string]interface{}{
		"request_id": requestID,
		"approve_url": approveURL,
		"expires_in": 300,
	}, nil, nil)
}

// handleApprovalPoll checks the status of an approval request.
// GET /api/v1/wallet/approve/{id} (wallet auth)
func (s *Server) handleApprovalPoll(w http.ResponseWriter, r *http.Request) {
	userID := walletUserIDFromContext(r.Context())
	if userID == "" {
		writeAPIError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	pool, err := getAdminAuthzDBPool()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "database not available")
		return
	}

	requestID := mux.Vars(r)["id"]
	if requestID == "" {
		writeAPIError(w, http.StatusBadRequest, "missing request id")
		return
	}

	var status string
	var signature *string
	var expiresAt time.Time
	err = pool.QueryRow(r.Context(), `
		SELECT status, signature, expires_at
		FROM public.wallet_approval_requests
		WHERE id = $1 AND user_id = $2
	`, requestID, userID).Scan(&status, &signature, &expiresAt)
	if err != nil {
		writeAPIError(w, http.StatusNotFound, "approval request not found")
		return
	}

	// Auto-expire if past expires_at and still pending
	if status == "pending" && time.Now().After(expiresAt) {
		_, _ = pool.Exec(r.Context(), `
			UPDATE public.wallet_approval_requests SET status = 'expired' WHERE id = $1 AND status = 'pending'
		`, requestID)
		status = "expired"
	}

	data := map[string]interface{}{
		"status": status,
	}
	if status == "approved" && signature != nil {
		data["signature"] = *signature
	}

	writeAPIResponse(w, data, nil, nil)
}

// handleApprovalSign signs/approves an approval request (called by the wallet app).
// POST /api/v1/wallet/approve/{id}/sign (Supabase JWT auth)
func (s *Server) handleApprovalSign(w http.ResponseWriter, r *http.Request) {
	userID := walletUserIDFromContext(r.Context())
	if userID == "" {
		writeAPIError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	pool, err := getAdminAuthzDBPool()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "database not available")
		return
	}

	requestID := mux.Vars(r)["id"]
	if requestID == "" {
		writeAPIError(w, http.StatusBadRequest, "missing request id")
		return
	}

	var req struct {
		Signature    string `json:"signature"`
		CredentialID string `json:"credential_id"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Signature == "" {
		writeAPIError(w, http.StatusBadRequest, "signature is required")
		return
	}

	// Verify the request belongs to this user and is pending
	var status string
	var expiresAt time.Time
	err = pool.QueryRow(r.Context(), `
		SELECT status, expires_at
		FROM public.wallet_approval_requests
		WHERE id = $1 AND user_id = $2
	`, requestID, userID).Scan(&status, &expiresAt)
	if err != nil {
		writeAPIError(w, http.StatusNotFound, "approval request not found")
		return
	}

	if status != "pending" {
		writeAPIError(w, http.StatusConflict, "request is not pending (status: "+status+")")
		return
	}
	if time.Now().After(expiresAt) {
		_, _ = pool.Exec(r.Context(), `
			UPDATE public.wallet_approval_requests SET status = 'expired' WHERE id = $1 AND status = 'pending'
		`, requestID)
		writeAPIError(w, http.StatusGone, "request has expired")
		return
	}

	// Update the request as approved
	_, err = pool.Exec(r.Context(), `
		UPDATE public.wallet_approval_requests
		SET status = 'approved', signature = $3, credential_id = $4, resolved_at = NOW()
		WHERE id = $1 AND user_id = $2 AND status = 'pending'
	`, requestID, userID, req.Signature, req.CredentialID)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to approve request")
		return
	}

	writeAPIResponse(w, map[string]interface{}{
		"approved": true,
	}, nil, nil)
}
