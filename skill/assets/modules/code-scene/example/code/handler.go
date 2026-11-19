package api

import (
	"context" // +
	"encoding/json"
	"net/http"
	"time" // +
)

// GetUser returns one user as JSON.
func (s *Server) GetUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second) // +
	defer cancel() // +

	user, err := s.db.FindUser(id) // -
	user, err := s.db.FindUser(ctx, id) // +
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	s.log.Info("served", "id", id)
	json.NewEncoder(w).Encode(user)
}
