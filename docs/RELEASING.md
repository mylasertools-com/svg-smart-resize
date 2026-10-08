# First npm release

Version **0.1.0** is prepared. npm publication is intentionally waiting for the maintainer to create the npm organization and confirm its scope.

## Already prepared

- Public repository: https://github.com/mylasertools-com/svg-smart-resize
- Live demo: https://mylasertools-com.github.io/svg-smart-resize/demo/
- MIT license, illustrated README, API reference, and contribution guide.
- ESM/CommonJS builds, matching TypeScript declarations, and zero runtime dependencies.
- 41 passing geometry tests; CI covers Node 20, 22, and 24, plus Windows.
- An isolated consumer check installs the tarball and verifies ESM, CommonJS, and TypeScript.
- Approximately 11 KB gzipped; CI enforces a 12,000-byte budget.
- Manual `publish.yml` workflow with provenance and npm trusted publishing support.

## Resume publication

1. **Confirm the npm scope.** The prepared name is `@mylasertools/svg-smart-resize`. GitHub and npm organizations are separate. The publishing account must have access to the selected npm organization.
2. If the scope differs, update the package name, lockfile, README examples/badges, demo links, and artwork generator. Regenerate the illustrations with `npm run assets`, commit, and let CI complete.
3. Start a fresh `npm login --auth-type=web`, then verify the account with `npm whoami`. Login links from an earlier session can expire.
4. From the repository root, run:

   ```sh
   npm ci
   npm run check
   npm run test:package
   npm run format:check
   npm pack --dry-run
   ```

5. Publish the initial version using the authenticated account:

   ```sh
   npm publish --access public
   ```

   Complete any npm two-factor authentication challenge. Do not put credentials or one-time codes in source files or workflow definitions.

6. Verify the published version with `npm view @mylasertools/svg-smart-resize version` (substitute the confirmed scope), then install that exact registry version in a fresh consumer and exercise both module entry points.
7. Create GitHub release `v0.1.0` from the published commit, using `CHANGELOG.md` for release notes. Do not bump the version merely because publication was deferred.
8. Configure the package's npm trusted publisher for future releases:

   | Setting           | Value                             |
   | :---------------- | :-------------------------------- |
   | Provider          | GitHub Actions                    |
   | Organization/user | `mylasertools-com`                |
   | Repository        | `svg-smart-resize`                |
   | Workflow filename | `publish.yml`                     |
   | Environment       | Leave empty                       |
   | Allowed action    | Direct publishing (`npm publish`) |

   The workflow is manual and runs only from `main`. Its version input must exactly match `package.json`. The workflow file alone does not establish npm trust.

Until publication is complete, the live demo and cloned source are available; registry installation is pending.
