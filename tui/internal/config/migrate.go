package config

// Versioned config migrations (MMM2). Each entry of `migrations` is a
// function that turns a Config of version N-1 into one of version N.
// On Load, Migrate walks the slice from the user's current
// ConfigVersion up to the latest, calling each in order.
//
// Why bother before the first breaking change? Adding the framework is
// cheap; adding it AFTER a key rename means the first user with a
// stale config can't boot. Better to land it dormant.

// CurrentConfigVersion is the schema generation the running binary
// understands. Bump this whenever you append a new entry to
// `migrations` so configs written today get the right version stamp.
const CurrentConfigVersion = 1

// migrations is the ordered list of forward migrations. Index i in
// the slice produces ConfigVersion == i+1 (i.e. migrations[0] writes
// version 1, migrations[1] writes version 2, …). Each migration must
// be a pure function — no I/O, no logging — so it's safe to apply
// multiple times in dry-run tests.
var migrations = []func(Config) Config{
	// v1: stamp existing configs with the current version. Pre-MMM2
	// configs have ConfigVersion=nil; this migration's only job is to
	// claim the field. Future renames go in v2+.
	func(c Config) Config {
		v := 1
		c.ConfigVersion = &v
		return c
	},
}

// Migrate walks cfg forward through every migration whose version is
// greater than cfg.ConfigVersion. Returns the migrated config and the
// number of migrations that ran (useful for tests; the production
// caller in LoadFrom ignores it).
func Migrate(cfg Config) (Config, int) {
	from := 0
	if cfg.ConfigVersion != nil {
		from = *cfg.ConfigVersion
	}
	ran := 0
	for i := from; i < len(migrations); i++ {
		cfg = migrations[i](cfg)
		ran++
	}
	return cfg, ran
}
