package graphfx

import (
	"github.com/theyoungwolf-dev/kortex/graph"
	"go.uber.org/fx"
)

var Module = fx.Module("graph",
	fx.Provide(
		graph.NewResolver,
		NewServer,
	),
)
