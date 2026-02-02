# CI

This repository contains a set of GitHub actions and (reusable) workflows used
to implement cross-repository workflows and reuse workflows across the
eclipse-zenoh organization.

## Workflows

### update-latest-downloads.yml

**Purpose**: Update the "latest" symlink on download.eclipse.org to point to a specific release version.

**Trigger**: Manual (`workflow_dispatch`)

**Inputs**:
- `version` (required): The version to mark as latest (e.g., `1.7.2`)
- `dry-run` (optional): Test mode - verify credentials and show what would be updated without modifying (default: `false`)

**Required Secrets**:
- `SSH_PRIVATE_KEY`: SSH private key (ED25519) for `genie.zenoh` authentication
- `SSH_PASSPHRASE`: Passphrase for the SSH key (if key is encrypted)

**Setup**:
Request SCP credentials from Eclipse CBI by opening a [HelpDesk issue](https://gitlab.eclipse.org/eclipsefdn/helpdesk/-/issues/new) with the following:
- Project: Zenoh
- Request: SSH credentials for `projects-storage.eclipse.org`
- Purpose: Automated downloads.eclipse.org management

Once credentials are provided, add them as GitHub Secrets:
1. Navigate to Settings → Secrets and variables → Actions
2. Create the four secrets listed above
3. Alternatively, add via [Otterdog configuration](https://github.com/eclipse-cbi/.eclipsefdn)

**Behavior**:
1. Connects to `projects-storage.eclipse.org` via SSH
2. For each package directory matching `/home/data/httpd/download.eclipse.org/zenoh/z*/{version}/`:
   - **Dry-run mode**: Lists symlinks that would be created without making changes
   - **Live mode**: Creates symlinks from `latest/` to the version directory (removes old symlinks first)
3. Symlinks are force-created with `ln -sfr` (space-efficient, points to actual version directory)
4. Reports the number of symlinks created/would be created
5. In dry-run: Verifies SSH connection and credentials work
6. In live: Verifies all `latest/` symlinks point to correct version directories

**Usage**:
First-time setup: Use `dry-run: true` to verify credentials:
1. Navigate to Actions → Update latest downloads on download.eclipse.org
2. Click "Run workflow"
3. Enter the version (e.g., `1.7.2`)
4. Check `dry-run` checkbox
5. Click "Run workflow"
6. Workflow will connect and show what would be updated without making changes

Production run: Once dry-run succeeds, run again with `dry-run: false` to actually update files.
