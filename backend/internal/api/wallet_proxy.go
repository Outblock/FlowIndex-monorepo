package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	jwtlib "github.com/golang-jwt/jwt/v5"
)

// handleWalletMe returns the authenticated user's keys and accounts.
// GET /api/v1/wallet/me (wallet auth)
func (s *Server) handleWalletMe(w http.ResponseWriter, r *http.Request) {
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

	// Query user_keys
	rows, err := pool.Query(r.Context(), `
		SELECT id, flow_address, public_key, key_index, label, sig_algo, hash_algo, source, created_at
		FROM public.user_keys
		WHERE user_id = $1
		ORDER BY created_at
	`, userID)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to query keys")
		return
	}
	defer rows.Close()

	var keys []map[string]interface{}
	for rows.Next() {
		var id, flowAddr, pubKey string
		var keyIndex int
		var label, sigAlgo, hashAlgo, source string
		var createdAt time.Time
		if err := rows.Scan(&id, &flowAddr, &pubKey, &keyIndex, &label, &sigAlgo, &hashAlgo, &source, &createdAt); err != nil {
			continue
		}
		keys = append(keys, map[string]interface{}{
			"id":           id,
			"flow_address": flowAddr,
			"public_key":   pubKey,
			"key_index":    keyIndex,
			"label":        label,
			"sig_algo":     sigAlgo,
			"hash_algo":    hashAlgo,
			"source":       source,
			"created_at":   createdAt.UTC().Format(time.RFC3339),
		})
	}
	if keys == nil {
		keys = []map[string]interface{}{}
	}

	// Query passkey_credentials with flow accounts
	pRows, err := pool.Query(r.Context(), `
		SELECT id, public_key_sec1_hex, flow_address, authenticator_name, created_at
		FROM public.passkey_credentials
		WHERE user_id = $1 AND flow_address IS NOT NULL
		ORDER BY created_at
	`, userID)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to query accounts")
		return
	}
	defer pRows.Close()

	var accounts []map[string]interface{}
	for pRows.Next() {
		var id, pubKeyHex, flowAddr string
		var authName *string
		var createdAt time.Time
		if err := pRows.Scan(&id, &pubKeyHex, &flowAddr, &authName, &createdAt); err != nil {
			continue
		}
		acct := map[string]interface{}{
			"id":                  id,
			"public_key_sec1_hex": pubKeyHex,
			"flow_address":        flowAddr,
			"created_at":          createdAt.UTC().Format(time.RFC3339),
		}
		if authName != nil {
			acct["authenticator_name"] = *authName
		}
		accounts = append(accounts, acct)
	}
	if accounts == nil {
		accounts = []map[string]interface{}{}
	}

	writeAPIResponse(w, map[string]interface{}{
		"keys":     keys,
		"accounts": accounts,
	}, nil, nil)
}

// handleWalletSign proxies a signing request to the flow-keys edge function.
// POST /api/v1/wallet/sign (wallet auth)
func (s *Server) handleWalletSign(w http.ResponseWriter, r *http.Request) {
	userID := walletUserIDFromContext(r.Context())
	if userID == "" {
		writeAPIError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req struct {
		KeyID   string `json:"key_id"`
		Message string `json:"message"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.KeyID == "" || req.Message == "" {
		writeAPIError(w, http.StatusBadRequest, "key_id and message are required")
		return
	}

	// Call edge function with user impersonation
	body := map[string]interface{}{
		"endpoint": "/keys/sign",
		"data": map[string]interface{}{
			"keyId":   req.KeyID,
			"message": req.Message,
		},
	}
	resp, err := callEdgeFunction("flow-keys", body, userID)
	if err != nil {
		writeAPIError(w, http.StatusBadGateway, "edge function call failed: "+err.Error())
		return
	}

	// Forward the response as-is
	w.Header().Set("Content-Type", "application/json")
	w.Write(resp)
}

// callEdgeFunction calls a Supabase edge function with user impersonation.
func callEdgeFunction(funcName string, body interface{}, userID string) ([]byte, error) {
	supabaseURL := strings.TrimRight(os.Getenv("SUPABASE_URL"), "/")
	if supabaseURL == "" {
		supabaseURL = strings.TrimRight(os.Getenv("VITE_SUPABASE_URL"), "/")
	}
	if supabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL not configured")
	}

	serviceRoleKey := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	if serviceRoleKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_ROLE_KEY not configured")
	}

	// Issue a short-lived Supabase user JWT for impersonation
	userJWT, err := issueSupabaseUserJWT(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to issue user JWT: %w", err)
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal body: %w", err)
	}

	url := supabaseURL + "/functions/v1/" + funcName
	req, err := http.NewRequest("POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+userJWT)
	req.Header.Set("apikey", serviceRoleKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("edge function returned %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// issueSupabaseUserJWT creates a short-lived (5 min) Supabase user JWT for impersonation.
func issueSupabaseUserJWT(userID string) (string, error) {
	secret := strings.TrimSpace(os.Getenv("SUPABASE_JWT_SECRET"))
	if secret == "" {
		return "", fmt.Errorf("SUPABASE_JWT_SECRET not configured")
	}

	now := time.Now()
	claims := jwtlib.MapClaims{
		"sub":  userID,
		"role": "authenticated",
		"aud":  "authenticated",
		"iat":  now.Unix(),
		"exp":  now.Add(5 * time.Minute).Unix(),
	}
	token := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
