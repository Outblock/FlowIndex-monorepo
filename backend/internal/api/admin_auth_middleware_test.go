package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	jwtlib "github.com/golang-jwt/jwt/v5"
)

func TestAdminAuthMiddleware_AllowsLegacyToken(t *testing.T) {
	t.Setenv("ADMIN_TOKEN", "legacy-token")
	t.Setenv("ADMIN_JWT_SECRET", "")
	t.Setenv("SUPABASE_JWT_SECRET", "")

	status := runAdminAuthRequest(t, "legacy-token")
	if status != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, status)
	}
}

func TestAdminAuthMiddleware_RejectsWithoutConfiguredAuth(t *testing.T) {
	t.Setenv("ADMIN_TOKEN", "")
	t.Setenv("ADMIN_JWT_SECRET", "")
	t.Setenv("SUPABASE_JWT_SECRET", "")

	status := runAdminAuthRequest(t, "anything")
	if status != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, status)
	}
}

func TestAdminAuthMiddleware_AllowsJWTWithRoleAndTeam(t *testing.T) {
	t.Setenv("ADMIN_TOKEN", "")
	t.Setenv("ADMIN_JWT_SECRET", "secret-123")
	t.Setenv("SUPABASE_JWT_SECRET", "")
	t.Setenv("ADMIN_ALLOWED_ROLES", "admin,ops")
	t.Setenv("ADMIN_ALLOWED_TEAMS", "flowindex")

	token := makeAdminJWT(t, "secret-123", jwtlib.MapClaims{
		"sub": "11111111-1111-1111-1111-111111111111",
		"exp": time.Now().Add(5 * time.Minute).Unix(),
		"app_metadata": map[string]interface{}{
			"roles": []string{"admin"},
			"team":  "flowindex",
		},
	})

	status := runAdminAuthRequest(t, token)
	if status != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, status)
	}
}

func TestAdminAuthMiddleware_RejectsJWTWithoutRequiredRole(t *testing.T) {
	t.Setenv("ADMIN_TOKEN", "")
	t.Setenv("ADMIN_JWT_SECRET", "secret-123")
	t.Setenv("SUPABASE_JWT_SECRET", "")
	t.Setenv("ADMIN_ALLOWED_ROLES", "admin")
	t.Setenv("ADMIN_ALLOWED_TEAMS", "")

	token := makeAdminJWT(t, "secret-123", jwtlib.MapClaims{
		"sub":  "22222222-2222-2222-2222-222222222222",
		"exp":  time.Now().Add(5 * time.Minute).Unix(),
		"role": "authenticated",
	})

	status := runAdminAuthRequest(t, token)
	if status != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, status)
	}
}

func TestAdminAuthMiddleware_RejectsJWTWithoutRequiredTeam(t *testing.T) {
	t.Setenv("ADMIN_TOKEN", "")
	t.Setenv("ADMIN_JWT_SECRET", "secret-123")
	t.Setenv("SUPABASE_JWT_SECRET", "")
	t.Setenv("ADMIN_ALLOWED_ROLES", "admin")
	t.Setenv("ADMIN_ALLOWED_TEAMS", "flowindex")

	token := makeAdminJWT(t, "secret-123", jwtlib.MapClaims{
		"sub": "33333333-3333-3333-3333-333333333333",
		"exp": time.Now().Add(5 * time.Minute).Unix(),
		"app_metadata": map[string]interface{}{
			"role": "admin",
			"team": "other",
		},
	})

	status := runAdminAuthRequest(t, token)
	if status != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, status)
	}
}

func runAdminAuthRequest(t *testing.T, bearer string) int {
	t.Helper()

	handler := adminAuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/admin/ft", nil)
	if stringsTrimmed := strings.TrimSpace(bearer); stringsTrimmed != "" {
		req.Header.Set("Authorization", "Bearer "+stringsTrimmed)
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr.Code
}

func makeAdminJWT(t *testing.T, secret string, claims jwtlib.MapClaims) string {
	t.Helper()
	token := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign jwt: %v", err)
	}
	return signed
}
