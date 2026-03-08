package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
	"time"

	jwtlib "github.com/golang-jwt/jwt/v5"
)

// walletJWTClaims holds the claims for a wallet-scoped JWT.
type walletJWTClaims struct {
	Sub   string `json:"sub"`
	Scope string `json:"scope"`
	Exp   int64  `json:"exp"`
	Iat   int64  `json:"iat"`
}

// walletJWTSecret returns the secret used for signing/verifying wallet JWTs.
// Prefers WALLET_JWT_SECRET, falls back to SUPABASE_JWT_SECRET.
func walletJWTSecret() string {
	if s := strings.TrimSpace(os.Getenv("WALLET_JWT_SECRET")); s != "" {
		return s
	}
	return strings.TrimSpace(os.Getenv("SUPABASE_JWT_SECRET"))
}

// issueWalletJWT creates an HS256 JWT with scope:"wallet" for the given user.
func issueWalletJWT(userID string, ttl time.Duration) (string, error) {
	secret := walletJWTSecret()
	if secret == "" {
		return "", fmt.Errorf("wallet JWT secret not configured")
	}

	now := time.Now()
	claims := jwtlib.MapClaims{
		"sub":   userID,
		"scope": "wallet",
		"iat":   now.Unix(),
		"exp":   now.Add(ttl).Unix(),
	}
	token := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// validateWalletJWT verifies an HS256 wallet JWT and returns its claims.
// It checks the signature, expiration, and that scope == "wallet".
func validateWalletJWT(tokenStr string) (*walletJWTClaims, error) {
	secret := walletJWTSecret()
	if secret == "" {
		return nil, fmt.Errorf("wallet JWT secret not configured")
	}

	token, err := jwtlib.Parse(tokenStr, func(token *jwtlib.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwtlib.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	}, jwtlib.WithValidMethods([]string{jwtlib.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	mapClaims, ok := token.Claims.(jwtlib.MapClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid claims")
	}

	scope, _ := mapClaims["scope"].(string)
	if scope != "wallet" {
		return nil, fmt.Errorf("invalid scope: %q (expected \"wallet\")", scope)
	}

	sub, _ := mapClaims["sub"].(string)
	if sub == "" {
		return nil, fmt.Errorf("missing sub claim")
	}

	exp, _ := mapClaims["exp"].(float64)
	iat, _ := mapClaims["iat"].(float64)

	return &walletJWTClaims{
		Sub:   sub,
		Scope: scope,
		Exp:   int64(exp),
		Iat:   int64(iat),
	}, nil
}

// verifyHS256 verifies an HS256 HMAC signature.
// sigInput is the data that was signed, sigB64 is the base64url-encoded signature.
func verifyHS256(sigInput, sigB64 string, secret []byte) bool {
	sig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(sigInput))
	expected := mac.Sum(nil)
	return hmac.Equal(sig, expected)
}
