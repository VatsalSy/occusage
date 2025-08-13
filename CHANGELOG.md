# Changelog

All notable changes to this project will be documented in this file.

This project is a fork of [ccusage](https://github.com/ryoppippi/ccusage) with enhancements for OpenCode support.

## Fork History

### [15.9.2] - 2025-01-11 - Fork Establishment

#### 🚀 New Features
- **Full OpenCode Support**: Complete integration with OpenCode's usage tracking from `~/.config/opencode/projects/`
- **Dual Source Tracking**: Distinguish between OpenCode `[O]` and Claude Code `[C]` usage in all reports
- **Project Command**: New `bun run start project` command for project-based usage analysis
- **Enhanced Live Monitoring**: Improved real-time dashboard with better caching and performance
- **Unified Data Loading**: Combined data processing for both OpenCode and Claude Code platforms

#### 🔧 Enhancements
- **Advanced Filtering**: Enhanced date and project filtering capabilities
- **Improved Session Reporting**: Better session analysis with `--full` option
- **Enhanced JSON Output**: Improved structured data export for all commands
- **Better Error Handling**: More robust error handling and logging
- **Performance Improvements**: Optimized data loading and processing

#### 📚 Documentation
- **Comprehensive README**: Complete rewrite focusing on OpenCode + Claude Code dual support
- **Attribution Documentation**: Proper credits to original ccusage project and contributors
- **Usage Examples**: Extensive examples for all commands and features
- **Installation Guide**: Clear setup instructions for development and usage

#### 🏗️ Repository Structure
- **Clean Codebase**: Removed unnecessary CI/CD workflows and documentation site
- **Proper Attribution**: Updated package.json, LICENSE, and created ATTRIBUTION.md
- **Fork Identity**: Clear distinction as standalone occusage project

### Original ccusage History

This fork is based on ccusage commit `fa9f2110d035e8d5ce27cf1f1a05aae19aecdc6b`.

For the complete history of the original ccusage project, see:
- **Repository**: https://github.com/ryoppippi/ccusage
- **Releases**: https://github.com/ryoppippi/ccusage/releases
- **Contributors**: https://github.com/ryoppippi/ccusage/graphs/contributors

## Why This Fork?

### The Need for OpenCode Support

With SST's introduction of OpenCode, users needed:

1. **Unified Tracking**: Both platforms use the same Claude models and API
2. **Source Distinction**: Clear separation of usage between OpenCode and Claude Code
3. **Enhanced Analytics**: Project-based reporting and advanced monitoring features
4. **Specialized Features**: Features tailored for dual-platform usage patterns

### What We Preserved

- ✅ Full backward compatibility with original ccusage
- ✅ All existing commands and features
- ✅ Same CLI interface and JSON output formats
- ✅ Original pricing and cost calculation logic
- ✅ Live monitoring and blocks reporting

### What We Enhanced

- 🆕 OpenCode platform support
- 🆕 Dual source tracking and reporting
- 🆕 Project-based usage analysis
- 🆕 Enhanced live monitoring features
- 🆕 Improved documentation and examples

## Future Plans

- [ ] Enhanced project analytics and insights
- [ ] Custom reporting templates
- [ ] Integration with additional AI coding platforms
- [ ] Advanced cost optimization recommendations
- [ ] Team usage analytics and sharing features

## Contributing

We welcome contributions! This fork maintains the same open-source spirit as the original ccusage project.

### How to Contribute

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Recognition

All contributors will be recognized in both the repository and this changelog.

---

*This changelog documents the evolution from ccusage to occusage, maintaining transparency about the fork's purpose and enhancements while honoring the original project's contributions.*