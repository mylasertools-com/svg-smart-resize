# Releasing

Version **0.1.1** is the latest release of [`@mylasertools/svg-smart-resize`](https://www.npmjs.com/package/@mylasertools/svg-smart-resize). Releases use the maintainer's npm account `julia.mlt`, an owner of the `mylasertools` organization.

## Release checks

The package ships ESM/CommonJS builds and matching TypeScript declarations with zero runtime dependencies. CI covers Node 20, 22, and 24, plus Windows; the gzip budget is 12,000 bytes.

1. Update the version and changelog, then commit with the repository's explicit maintainer identity. Verify both `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT`, and verify the authenticated remote account.
2. From the repository root, run:

   ```sh
   npm ci
   npm run check
   npm run test:package
   npm run format:check
   npm pack --dry-run
   ```

3. Push to `main` and wait for CI to pass.
4. Publish using one of the methods below.
5. Allow npm's publish-time scan to finish before verifying installation. Publication can succeed while the registry still temporarily returns 404; do not republish or bump the version to work around this delay.
6. Verify the exact version with `npm view @mylasertools/svg-smart-resize@VERSION`, then install it from the registry in a fresh consumer and exercise ESM, CommonJS, and TypeScript.
7. Create the matching GitHub tag and release from the published commit, using `CHANGELOG.md` for release notes.

Published npm versions cannot be replaced. Do not reuse a published version number.

## Local publication

Authenticate with the approved npm account using `npm login --auth-type=web`, then verify it with `npm whoami` and confirm organization access.

```sh
npm publish --access public
```

Complete any npm two-factor authentication challenge. Keep credentials and one-time codes out of source files, logs, and workflow definitions. Local publication does not generate GitHub Actions provenance.

## GitHub Actions trusted publishing

The manual `publish.yml` workflow is prepared for npm trusted publishing with provenance. Configure the package's trusted publisher on npm before using it:

| Setting           | Value                             |
| :---------------- | :-------------------------------- |
| Provider          | GitHub Actions                    |
| Organization/user | `mylasertools-com`                |
| Repository        | `svg-smart-resize`                |
| Workflow filename | `publish.yml`                     |
| Environment       | Leave empty                       |
| Allowed action    | Direct publishing (`npm publish`) |

The workflow runs only from `main`, and its version input must exactly match `package.json`. The workflow file alone does not establish npm trust. After trust is configured, future releases can use this workflow without storing an npm token in GitHub.

Configure and use the trusted publisher together: npm expires unvalidated configurations after 48 hours. A successful trusted publish validates the configuration. See [npm's announcement](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire/).
