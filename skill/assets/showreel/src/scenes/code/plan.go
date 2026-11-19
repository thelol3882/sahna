package routing

import (
	"context"
	"time" // +
)

// PlanRoute orders a courier's stops inside their time windows.
func (s *Service) PlanRoute(ctx context.Context, req *PlanRequest) (*Plan, error) {
	ctx, cancel := context.WithTimeout(ctx, 800*time.Millisecond) // +
	defer cancel() // +

	if plan, ok := s.cache.Get(req.Key()); ok {
		return plan, nil
	}
	etas, err := s.maps.Matrix(req.Stops) // -
	etas, err := s.maps.Matrix(ctx, req.Stops) // +
	if err != nil {
		return s.fallback(req), nil
	}
	plan := s.solver.Solve(req.Stops, etas)
	s.cache.Set(req.Key(), plan, 2*time.Minute)
	return plan, nil
}
