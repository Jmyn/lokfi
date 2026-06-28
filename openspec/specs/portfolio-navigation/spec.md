# portfolio-navigation Specification

## Purpose
TBD - created by archiving change portfolio-hub-phase2. Update Purpose after archive.
## Requirements
### Requirement: Portfolio navigation item is added to sidebar
The system SHALL add a Portfolio navigation item to the AppShell sidebar.

#### Scenario: Sidebar renders
- **WHEN** the AppShell renders
- **THEN** the sidebar contains a "Portfolio" item with a `TrendingUp` icon
- **AND** it is positioned between "Dashboard" and "Import"
- **AND** clicking it navigates to `/portfolio`

#### Scenario: Active state
- **WHEN** the user is on `/portfolio`
- **THEN** the Portfolio nav item shows the active styling (accent background, left border)

### Requirement: Portfolio route is registered
The system SHALL register a `/portfolio` route in the router.

#### Scenario: Navigate to portfolio
- **WHEN** a user navigates to `/portfolio`
- **THEN** the `PortfolioPage` component renders inside the shell layout
- **AND** the default active tab is Overview

#### Scenario: Deep link to specific tab
- **WHEN** a user navigates to `/portfolio?tab=holdings`
- **THEN** the Holdings tab is active by default
- **AND** the URL remains `/portfolio?tab=holdings`

