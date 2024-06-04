# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- added `onPendingChangesUpdated` callback
- added `pendingChanges` config

### Fixed

- fix sync crashing due sending events to remove websocket actor

## [0.4.0] - 2024-06-01

### Changed

- removed `createWebSocketConnection` and moved it to `secsync-server` package
- dependency updates

## [0.3.0] - 2024-05-29

### Fixed

- correctly remove changes from pendingChanges queue when sending a snapshot or update
- correct check for window to avoid a react-native crash

### Changed

- renamed `websocketHost` to `websocketEndpoint`
- add signature context to harden the protocol
- add aead robustness as recommend by libsoidum docs
- upgraded xstate dependency

### Added

- add support for passing additionPublicData to onDocumentUpdated

## [0.2.0] - 2023-09-29

### Added

- Initial version
