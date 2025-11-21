# Code Signing Policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## Team Roles

### Authors (Committers)
Team members who are trusted to modify the source code in the project's version control system without additional reviews.

_To be defined based on your project's GitHub organization structure. Example:_
- Committers: [Members team](https://github.com/orgs/YOUR_ORG/teams/members)

### Reviewers
Each change proposed by people who are not committers (e.g. pull requests) must be reviewed by a team member.

_To be defined based on your project's GitHub organization structure. Example:_
- Reviewers: [Members team](https://github.com/orgs/YOUR_ORG/teams/members)

### Approvers
Each signing request must be approved by a team member trusted by the entire team to decide if a certain release can be code signed.

_To be defined based on your project's GitHub organization structure. Example:_
- Approvers: [Owners](https://github.com/orgs/YOUR_ORG/people?query=role%3Aowner)

## Privacy Policy

**This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.**

Pokepad stores all data locally on your device using the browser's localStorage API. No data is collected, transmitted, or shared with any external servers or third parties.

### Data Storage
- **Local Storage**: The app stores your audio file paths, tab configurations, cue points, and custom card names locally in your browser's localStorage
- **No Network Activity**: The app does not make any network requests or connect to external servers
- **No Analytics**: No usage analytics or telemetry data is collected
- **No User Tracking**: No user identification or tracking mechanisms are implemented

### Third-Party Components
- **Electron**: The app uses Electron framework for desktop functionality. Electron itself does not collect user data in this application.
- **electron-builder**: Used only during the build process, does not affect runtime behavior.

## System Changes

Pokepad does not modify your system configuration. It runs as a standalone application and:
- Does not modify system registry (Windows) or system preferences (macOS)
- Does not install system services or background processes
- Does not modify file associations or default applications
- Does not require administrator/root privileges

## Uninstallation

### macOS
1. Open Finder
2. Navigate to Applications folder
3. Drag the Pokepad app to Trash
4. Empty Trash to complete uninstallation

### Windows
1. Open Settings → Apps → Apps & features
2. Find "Pokepad" in the list
3. Click on it and select "Uninstall"
4. Follow the uninstallation prompts

Alternatively, you can delete the application folder directly:
- macOS: `~/Applications/pokepad.app`
- Windows: `C:\Users\[YourUsername]\AppData\Local\pokepad\`

**Note**: Uninstalling the app will remove the application, but your local data (stored in localStorage) may persist. To completely remove all data, you may need to clear your browser's local storage manually.

## Security Best Practices

All team members with code signing access must:
- Use multi-factor authentication (MFA) for both SignPath and source code repository access (e.g. GitHub)
- Follow secure coding practices
- Review all code changes before merging
- Approve signing requests only for verified releases

## Artifact Configuration

All signed binaries have metadata attributes set and enforced:
- **Product Name**: "pokepad"
- **Product Version**: Set to the same value in each build (from package.json version)

## Verification

Each release signature confirms that:
- The binary is a valid, automated build resulting from the source code at the noted source code repository
- The source code includes build scripts and CI configurations in the repository
- Code reviews pay special attention to build configuration files

## Reporting Issues

If you believe a signed binary violates this policy, please report it to support@signpath.io with:
- A concise description of the violation
- Proof of the violation
- Any relevant details

