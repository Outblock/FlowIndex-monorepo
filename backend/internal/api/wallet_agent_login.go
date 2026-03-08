package api

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// handleAgentLoginCreate creates a new agent login session.
// POST /api/v1/wallet/agent/login (public, no auth)
func (s *Server) handleAgentLoginCreate(w http.ResponseWriter, r *http.Request) {
	pool, err := getAdminAuthzDBPool()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "database not available")
		return
	}

	sessionID := uuid.New().String()
	expiresAt := time.Now().Add(5 * time.Minute)

	_, err = pool.Exec(r.Context(), `
		INSERT INTO public.agent_login_sessions (id, status, expires_at)
		VALUES ($1, 'pending', $2)
	`, sessionID, expiresAt)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to create login session")
		return
	}

	frontendURL := strings.TrimRight(os.Getenv("FLOWINDEX_FRONTEND_URL"), "/")
	if frontendURL == "" {
		frontendURL = "https://flowindex.io"
	}
	loginURL := frontendURL + "/agent/auth?session=" + sessionID

	writeAPIResponse(w, map[string]interface{}{
		"session_id": sessionID,
		"login_url":  loginURL,
		"expires_in": 300,
	}, nil, nil)
}

// handleAgentLoginPoll checks the status of an agent login session.
// GET /api/v1/wallet/agent/login/{id} (public, no auth)
func (s *Server) handleAgentLoginPoll(w http.ResponseWriter, r *http.Request) {
	pool, err := getAdminAuthzDBPool()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "database not available")
		return
	}

	sessionID := mux.Vars(r)["id"]
	if sessionID == "" {
		writeAPIError(w, http.StatusBadRequest, "missing session id")
		return
	}

	var status string
	var walletToken *string
	var expiresAt time.Time
	err = pool.QueryRow(r.Context(), `
		SELECT status, wallet_token, expires_at
		FROM public.agent_login_sessions
		WHERE id = $1
	`, sessionID).Scan(&status, &walletToken, &expiresAt)
	if err != nil {
		writeAPIError(w, http.StatusNotFound, "session not found")
		return
	}

	// Auto-expire if past expires_at and still pending
	if status == "pending" && time.Now().After(expiresAt) {
		_, _ = pool.Exec(r.Context(), `
			UPDATE public.agent_login_sessions SET status = 'expired' WHERE id = $1 AND status = 'pending'
		`, sessionID)
		status = "expired"
	}

	data := map[string]interface{}{
		"status": status,
	}
	if status == "completed" && walletToken != nil {
		data["token"] = *walletToken
	}

	writeAPIResponse(w, data, nil, nil)
}

// handleAgentLoginComplete completes an agent login session by issuing a wallet JWT.
// POST /api/v1/wallet/agent/login/{id}/complete (Supabase JWT auth)
func (s *Server) handleAgentLoginComplete(w http.ResponseWriter, r *http.Request) {
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

	sessionID := mux.Vars(r)["id"]
	if sessionID == "" {
		writeAPIError(w, http.StatusBadRequest, "missing session id")
		return
	}

	// Verify session is pending and not expired
	var status string
	var expiresAt time.Time
	err = pool.QueryRow(r.Context(), `
		SELECT status, expires_at
		FROM public.agent_login_sessions
		WHERE id = $1
	`, sessionID).Scan(&status, &expiresAt)
	if err != nil {
		writeAPIError(w, http.StatusNotFound, "session not found")
		return
	}

	if status != "pending" {
		writeAPIError(w, http.StatusConflict, "session is not pending (status: "+status+")")
		return
	}
	if time.Now().After(expiresAt) {
		_, _ = pool.Exec(r.Context(), `
			UPDATE public.agent_login_sessions SET status = 'expired' WHERE id = $1 AND status = 'pending'
		`, sessionID)
		writeAPIError(w, http.StatusGone, "session has expired")
		return
	}

	// Issue wallet JWT (24h TTL)
	token, err := issueWalletJWT(userID, 24*time.Hour)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to issue wallet token")
		return
	}

	// Update session
	_, err = pool.Exec(r.Context(), `
		UPDATE public.agent_login_sessions
		SET status = 'completed', user_id = $2, wallet_token = $3, completed_at = NOW()
		WHERE id = $1 AND status = 'pending'
	`, sessionID, userID, token)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to complete session")
		return
	}

	writeAPIResponse(w, map[string]interface{}{
		"completed": true,
	}, nil, nil)
}

// decodeJSONBody is a helper to decode a JSON request body into a target struct.
func decodeJSONBody(r *http.Request, target interface{}) error {
	return json.NewDecoder(r.Body).Decode(target)
}
