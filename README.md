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
   - Copies all files to the corresponding `latest/` directory
   - Removes old `latest/` directory before copying
   - Creates `latest/` if it doesn't exist
3. Reports the number of packages updated
4. Verifies all `latest/` directories contain files

**Example**:
To update latest downloads for version 1.7.2:
1. Navigate to Actions → Update latest downloads on download.eclipse.org
2. Click "Run workflow"
3. Enter `1.7.2` in the version field
4. Click "Run workflow"

The workflow will update all package "latest" directories to mirror the 1.7.2 release artifacts.
