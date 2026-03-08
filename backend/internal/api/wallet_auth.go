package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
)

// ctxKeyWalletUserID is the context key for the authenticated wallet user ID.
type ctxKeyWalletUserID struct{}

// walletUserIDFromContext extracts the authenticated wallet user ID from ctx.
func walletUserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(ctxKeyWalletUserID{}).(string)
	return v
}

// walletAuthMiddleware authenticates requests for wallet endpoints.
// It tries two methods in order:
//  1. Authorization: Bearer {wallet_jwt} — validated via validateWalletJWT
//  2. X-API-Key header — sha256 hashed, resolved via apiKeyResolver, scope checked
//
// On success, the user ID is stored in ctx via ctxKeyWalletUserID.
// Returns 401 if neither method succeeds.
func (s *Server) walletAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}

		// Method 1: Bearer wallet JWT
		if bearer := extractBearerToken(r.Header.Get("Authorization")); bearer != "" {
			claims, err := validateWalletJWT(bearer)
			if err == nil && claims.Sub != "" {
				ctx := context.WithValue(r.Context(), ctxKeyWalletUserID{}, claims.Sub)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			// Bearer token present but invalid — don't fall through to API key,
			// unless it might be a Supabase JWT (handled elsewhere). Just try API key.
		}

		// Method 2: X-API-Key header
		if apiKey := r.Header.Get("X-API-Key"); apiKey != "" && s.apiKeyResolver != nil {
			keyHash := sha256Hex(apiKey)
			userID, err := s.apiKeyResolver(r.Context(), keyHash)
			if err == nil && userID != "" {
				ok, scopeErr := checkAPIKeyScope(r.Context(), keyHash, "wallet:sign")
				if scopeErr == nil && ok {
					ctx := context.WithValue(r.Context(), ctxKeyWalletUserID{}, userID)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		writeAPIError(w, http.StatusUnauthorized, "wallet authentication required: provide Authorization Bearer wallet JWT or X-API-Key with wallet:sign scope")
	})
}

// sha256Hex computes the SHA-256 hash of s and returns it as a lowercase hex string.
func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// checkAPIKeyScope queries the api_keys table to verify that the given key hash
// has the required scope and is active.
func checkAPIKeyScope(ctx context.Context, keyHash, requiredScope string) (bool, error) {
	pool, err := getAdminAuthzDBPool()
	if err != nil {
		return false, err
	}

	var scopes []string
	var isActive bool
	err = pool.QueryRow(ctx, `
		SELECT scopes, is_active
		FROM public.api_keys
		WHERE key_hash = $1
	`, keyHash).Scan(&scopes, &isActive)
	if err != nil {
		return false, err
	}
	if !isActive {
		return false, nil
	}

	for _, s := range scopes {
		if s == requiredScope {
			return true, nil
		}
	}
	return false, nil
}
