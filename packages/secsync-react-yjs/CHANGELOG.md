# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2024-06-01

### Changed

- dependency updates

## [0.3.0] - 2024-05-29

### Fixed

- Instead of only allowing specific Yjs change origins now only change explicitly added by secsync are ignored
- Correct check for window to avoid a react-native crash
- Adding changes twice and causing the state machine to fail
- Fix double events by aligning the "secsync-remote" event origin

### Changes

- Upgraded dependencies

## [0.2.0] - 2023-09-29

### Added

- Initial version
