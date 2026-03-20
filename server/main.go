package main

import (
	"log"

	"github.com/theyoungwolf-dev/kortex/auth"
	"github.com/theyoungwolf-dev/kortex/ent/entfx"
	"github.com/theyoungwolf-dev/kortex/graph/graphfx"
	"github.com/theyoungwolf-dev/kortex/httpfx"
	"github.com/theyoungwolf-dev/kortex/internal"
	"github.com/theyoungwolf-dev/kortex/media"
	"github.com/theyoungwolf-dev/kortex/payments"
	"github.com/theyoungwolf-dev/kortex/storage"
	"go.uber.org/fx"
	"go.uber.org/fx/fxevent"
	"go.uber.org/zap"
)

func main() {
	cfg, err := internal.ParseConfig()

	if err != nil {
		log.Fatalf("unable to parse config, %v", err)
	}

	fx.New(
		fx.Provide(
			func(cfg internal.Config) (*zap.Logger, error) {
				if cfg.Environment == "development" {
					return zap.NewDevelopment()
				}

				return zap.NewProduction()
			},
			storage.NewS3Client,
		),
		fx.WithLogger(func(log *zap.Logger) fxevent.Logger {
			return &fxevent.ZapLogger{Logger: log}
		}),
		fx.Supply(cfg),
		auth.Module,
		graphfx.Module,
		httpfx.Module,
		entfx.Module,
		payments.Module,
		media.Module,
	).Run()
}
