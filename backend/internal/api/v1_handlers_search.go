package api

import (
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil {
		writeAPIError(w, http.StatusInternalServerError, "repository unavailable")
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		writeAPIError(w, http.StatusBadRequest, "query must be at least 2 characters")
		return
	}
	if len(q) > 100 {
		writeAPIError(w, http.StatusBadRequest, "query must be at most 100 characters")
		return
	}

	limit := 3
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 5 {
			limit = n
		}
	}

	result, err := s.repo.SearchAll(r.Context(), q, limit)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeAPIResponse(w, result, nil, nil)
}
