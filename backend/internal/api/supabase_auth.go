package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	jwtlib "github.com/golang-jwt/jwt/v5"
)

// supabaseAuthMiddleware authenticates requests using Supabase JWTs.
// It extracts the Bearer token, validates the HS256 signature using
// SUPABASE_JWT_SECRET, checks expiration, and stores the user_id (sub claim)
// in context via ctxKeyWalletUserID.
func (s *Server) supabaseAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}

		bearer := extractBearerToken(r.Header.Get("Authorization"))
		if bearer == "" {
			writeAPIError(w, http.StatusUnauthorized, "missing Authorization bearer token")
			return
		}

		secret := strings.TrimSpace(os.Getenv("SUPABASE_JWT_SECRET"))
		if secret == "" {
			writeAPIError(w, http.StatusInternalServerError, "Supabase JWT secret not configured")
			return
		}

		token, err := jwtlib.Parse(bearer, func(token *jwtlib.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwtlib.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(secret), nil
		}, jwtlib.WithValidMethods([]string{
			jwtlib.SigningMethodHS256.Alg(),
		}))
		if err != nil {
			writeAPIError(w, http.StatusUnauthorized, fmt.Sprintf("invalid Supabase JWT: %v", err))
			return
		}

		mapClaims, ok := token.Claims.(jwtlib.MapClaims)
		if !ok || !token.Valid {
			writeAPIError(w, http.StatusUnauthorized, "invalid token claims")
			return
		}

		// Check expiration (jwt library checks this too, but be explicit)
		if exp, ok := mapClaims["exp"].(float64); ok {
			if time.Now().Unix() > int64(exp) {
				writeAPIError(w, http.StatusUnauthorized, "token expired")
				return
			}
		}

		sub, _ := mapClaims["sub"].(string)
		if sub == "" {
			writeAPIError(w, http.StatusUnauthorized, "missing sub claim in token")
			return
		}

		ctx := context.WithValue(r.Context(), ctxKeyWalletUserID{}, sub)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
