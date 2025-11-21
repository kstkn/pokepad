# SignPath Foundation Compliance Checklist

This document tracks compliance with [SignPath Foundation's requirements](https://signpath.org/terms) for free code signing.

## ✅ Basic Requirements (for free OSS subscriptions)

- [x] **No malware**: Project does not contain malware or potentially unwanted programs
- [x] **OSS License**: Uses MIT License (OSI-approved, no commercial dual-licensing)
- [x] **No proprietary code**: Only uses open-source dependencies (Electron, electron-builder)
- [ ] **Maintained**: Project must be actively maintained (verify ongoing commits/activity)
- [ ] **Released**: Project must already be released (needs at least one public release)
- [x] **Documented**: Functionality is described in README.md

## ✅ Additional Requirements (for free certificates)

### Conditions for what can be signed

- [x] **Sign your own projects only**: Team responsible for code signing is also responsible for development
- [x] **Sign your own binaries only**: Only signing software built from own source code
- [x] **No hacking tools**: Application is an audio player, not a security tool

### Conditions for end user interactions

- [x] **Respect user privacy and security**: 
  - No data collection or transmission
  - Privacy policy created (PRIVACY.md)
  - No user tracking
- [x] **Announce system changes**: Documented in CODE_SIGNING_POLICY.md - app does not modify system configuration
- [x] **Provide uninstallation**: Instructions provided in CODE_SIGNING_POLICY.md

### Conditions for OSS contributors

- [ ] **Follow security best practices**: 
  - [ ] All team members must use MFA for SignPath and GitHub
  - [ ] Document team members with MFA enabled
- [ ] **Assign code signing roles**: 
  - [ ] Define Authors/Committers
  - [ ] Define Reviewers
  - [ ] Define Approvers
  - [ ] Update CODE_SIGNING_POLICY.md with actual team structure

### Conditions for the website / repository

- [x] **Specify a code signing policy**: 
  - [x] CODE_SIGNING_POLICY.md created
  - [x] Linked from README.md
  - [x] Privacy policy included
  - [ ] Team roles need to be filled in with actual GitHub team links

### SignPath configuration requirements

- [x] **Artifact configuration**: 
  - [x] Product name set to "pokepad" in package.json
  - [x] Product version set in package.json (currently 1.0.0)
  - [x] Version will be consistent in each build

### Other conditions

- [x] **Don't fight the system**: Will accept all technical constraints
- [x] **Investigate accusations**: Will assist in verification if complaints received

## 📋 Action Items Before Applying

1. **Make at least one public release** (tag a version, create a GitHub release)
2. **Set up GitHub organization/teams** (if using organization) or document individual contributors
3. **Update CODE_SIGNING_POLICY.md** with actual team member information:
   - Replace placeholder team links with actual GitHub team/organization links
   - List actual committers, reviewers, and approvers
4. **Ensure all team members have MFA enabled** on GitHub and document this
5. **Update repository URLs** in package.json (replace YOUR_USERNAME with actual GitHub username/org)
6. **Verify active maintenance** - ensure there are recent commits/activity

## 📝 Notes

- The app is fully compliant with privacy requirements (no data collection, no network activity)
- All code is open source with MIT license
- No proprietary components are included
- The application does not modify system configuration
- Uninstallation instructions are documented

## 🔗 References

- [SignPath Foundation Terms](https://signpath.org/terms)
- [SignPath.io](https://signpath.io)

