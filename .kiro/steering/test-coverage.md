# Steering: Test Coverage

- Targets: services >= 90%, repository >= 85%, routes >= 80%, frontend hooks/components >= 80%.
- Property-based tests (fast-check) for logic with large input spaces; minimum 100 iterations.
- Tag property tests: `// Feature: trade-blotter, Property N: <property text>`.
- Cover the error paths, not just the happy path (404/409/400, network failure, parse failure).
