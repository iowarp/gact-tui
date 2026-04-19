package config

import "testing"

func intPtr(v int) *int { return &v }

// TestMigrate_PreVersionedRunsAll: a config with no ConfigVersion
// (pre-MMM2 era) walks through every registered migration.
func TestMigrate_PreVersionedRunsAll(t *testing.T) {
	in := Config{}
	out, ran := Migrate(in)
	if ran != len(migrations) {
		t.Errorf("expected %d migrations to run, got %d", len(migrations), ran)
	}
	if out.ConfigVersion == nil || *out.ConfigVersion != CurrentConfigVersion {
		got := "nil"
		if out.ConfigVersion != nil {
			got = string(rune(*out.ConfigVersion + '0'))
		}
		t.Errorf("expected ConfigVersion=%d, got %s", CurrentConfigVersion, got)
	}
}

// TestMigrate_AlreadyCurrent: a config already at the latest version
// runs zero migrations and is returned unchanged.
func TestMigrate_AlreadyCurrent(t *testing.T) {
	in := Config{ConfigVersion: intPtr(CurrentConfigVersion)}
	out, ran := Migrate(in)
	if ran != 0 {
		t.Errorf("expected 0 migrations on current config, got %d", ran)
	}
	if out.ConfigVersion == nil || *out.ConfigVersion != CurrentConfigVersion {
		t.Errorf("ConfigVersion should remain %d", CurrentConfigVersion)
	}
}

// TestMigrate_PartialRun: starting at version N runs only migrations
// > N. Pin a fake migration list to a known length so the test stays
// stable as new migrations land.
func TestMigrate_PartialRun(t *testing.T) {
	// Save + restore so we don't pollute the package state.
	saved := migrations
	defer func() { migrations = saved }()

	v1Calls, v2Calls := 0, 0
	migrations = []func(Config) Config{
		func(c Config) Config {
			v1Calls++
			x := 1
			c.ConfigVersion = &x
			return c
		},
		func(c Config) Config {
			v2Calls++
			x := 2
			c.ConfigVersion = &x
			return c
		},
	}

	in := Config{ConfigVersion: intPtr(1)}
	_, ran := Migrate(in)
	if ran != 1 {
		t.Errorf("expected 1 migration to run from v1, got %d", ran)
	}
	if v1Calls != 0 {
		t.Errorf("v1 migration should not re-run on v1 config, ran %d times", v1Calls)
	}
	if v2Calls != 1 {
		t.Errorf("v2 migration should run exactly once, ran %d times", v2Calls)
	}
}
