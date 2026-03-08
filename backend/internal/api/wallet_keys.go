package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

// handleWalletKeyCreate creates a new wallet API key.
// POST /api/v1/wallet/keys (Supabase JWT auth)
func (s *Server) handleWalletKeyCreate(w http.ResponseWriter, r *http.Request) {
	userID := walletUserIDFromContext(r.Context())
	if userID == "" {
		writeAPIError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeAPIError(w, http.StatusBadRequest, "name is required")
		return
	}

	pool, err := getAdminAuthzDBPool()
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "database not available")
		return
	}

	// Generate 32 random bytes -> "wk_" + hex
	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to generate key")
		return
	}
	fullKey := "wk_" + hex.EncodeToString(randomBytes)

	// Prefix = first 11 chars
	keyPrefix := fullKey[:11]

	// SHA256 hash the full key
	hash := sha256.Sum256([]byte(fullKey))
	keyHash := hex.EncodeToString(hash[:])

	scopes := []string{"wallet:sign"}

	var id string
	var createdAt time.Time
	err = pool.QueryRow(r.Context(), `
		INSERT INTO public.api_keys (user_id, name, key_hash, key_prefix, scopes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`, userID, req.Name, keyHash, keyPrefix, scopes).Scan(&id, &createdAt)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to create API key")
		return
	}

	writeAPIResponse(w, map[string]interface{}{
		"id":         id,
		"name":       req.Name,
		"key":        fullKey,
		"key_prefix": keyPrefix,
		"scopes":     scopes,
		"created_at": createdAt.UTC().Format(time.RFC3339),
	}, nil, nil)
}

// handleWalletKeyList lists all wallet API keys for the authenticated user.
// GET /api/v1/wallet/keys (Supabase JWT auth)
func (s *Server) handleWalletKeyList(w http.ResponseWriter, r *http.Request) {
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

	rows, err := pool.Query(r.Context(), `
		SELECT id, name, key_prefix, scopes, is_active, created_at, last_used_at
		FROM public.api_keys
		WHERE user_id = $1 AND 'wallet:sign' = ANY(scopes)
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to query keys")
		return
	}
	defer rows.Close()

	var items []map[string]interface{}
	for rows.Next() {
		var id, name, keyPrefix string
		var scopes []string
		var isActive bool
		var createdAt time.Time
		var lastUsedAt *time.Time
		if err := rows.Scan(&id, &name, &keyPrefix, &scopes, &isActive, &createdAt, &lastUsedAt); err != nil {
			continue
		}
		item := map[string]interface{}{
			"id":         id,
			"name":       name,
			"key_prefix": keyPrefix,
			"scopes":     scopes,
			"is_active":  isActive,
			"created_at": createdAt.UTC().Format(time.RFC3339),
		}
		if lastUsedAt != nil {
			item["last_used_at"] = lastUsedAt.UTC().Format(time.RFC3339)
		}
		items = append(items, item)
	}
	if items == nil {
		items = []map[string]interface{}{}
	}

	writeAPIResponse(w, map[string]interface{}{
		"items": items,
		"count": len(items),
	}, nil, nil)
}

// handleWalletKeyDelete deletes a wallet API key.
// DELETE /api/v1/wallet/keys/{id} (Supabase JWT auth)
func (s *Server) handleWalletKeyDelete(w http.ResponseWriter, r *http.Request) {
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

	keyID := mux.Vars(r)["id"]
	if keyID == "" {
		writeAPIError(w, http.StatusBadRequest, "missing key id")
		return
	}

	tag, err := pool.Exec(r.Context(), `
		DELETE FROM public.api_keys
		WHERE id = $1 AND user_id = $2 AND 'wallet:sign' = ANY(scopes)
	`, keyID, userID)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to delete key")
		return
	}
	if tag.RowsAffected() == 0 {
		writeAPIError(w, http.StatusNotFound, "key not found")
		return
	}

	writeAPIResponse(w, map[string]interface{}{
		"deleted": true,
	}, nil, nil)
}
