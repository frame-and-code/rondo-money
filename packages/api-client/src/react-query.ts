/**
 * TanStack Query options per endpoint, generated from the spec:
 * `useQuery(meControllerIdentifyOptions())`.
 *
 * A separate entry point on purpose. `@tanstack/react-query` is a peer dependency, and
 * re-exporting this from the package root would make it mandatory for everyone — a Node
 * script, an integration test or a server helper that only wants the request functions and
 * their types would fail to import the package at all.
 */
export * from './generated/@tanstack/react-query.gen';
