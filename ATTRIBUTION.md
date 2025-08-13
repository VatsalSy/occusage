# Attribution

## Original Project

This project is a fork of [ccusage](https://github.com/ryoppippi/ccusage) by [@ryoppippi](https://github.com/ryoppippi).

### Original Repository
- **Project**: ccusage - Claude Code Usage Analysis Tool
- **Author**: [@ryoppippi](https://github.com/ryoppippi)
- **Repository**: https://github.com/ryoppippi/ccusage
- **License**: MIT License
- **Documentation**: https://ccusage.com/

### Fork Point
- **Last Original Commit**: `fa9f2110d035e8d5ce27cf1f1a05aae19aecdc6b`
- **Fork Date**: After substantial development on OpenCode integration
- **Fork Reason**: Add comprehensive OpenCode support and enhanced features

## Original Contributors

We acknowledge and thank all contributors to the original ccusage project:

- [@ryoppippi](https://github.com/ryoppippi) - Original creator and maintainer
- [@renovate[bot]](https://github.com/apps/renovate) - Dependency updates
- [@ben-vargas](https://github.com/ben-vargas) - Contributor
- [@constantins2001](https://github.com/constantins2001) - Contributor
- [@nyatinte](https://github.com/nyatinte) - Contributor
- [@claude](https://github.com/claude) - Contributor
- [@a-c-m](https://github.com/a-c-m) - Contributor
- [@gemini-code-assist[bot]](https://github.com/apps/gemini-code-assist) - Contributor
- [@adhishthite](https://github.com/adhishthite) - Contributor
- [@timrogers](https://github.com/timrogers) - Contributor
- [@lapfelix](https://github.com/lapfelix) - Contributor
- [@yukukotani](https://github.com/yukukotani) - Contributor
- [@m-sigepon](https://github.com/m-sigepon) - Contributor
- [@AsPulse](https://github.com/AsPulse) - Contributor
- And [28+ additional contributors](https://github.com/ryoppippi/ccusage/graphs/contributors)

## OpenCode Project

### About OpenCode
- **Project**: OpenCode - AI coding agent, built for the terminal
- **Organization**: SST (Serverless Stack)  
- **Repository**: https://github.com/sst/opencode
- **Website**: https://opencode.ai
- **License**: MIT License
- **Created**: April 30, 2025

### OpenCode Team & Contributors
- **Lead Developer**: [@thdxr](https://github.com/thdxr) (Dax Raad)
- **Core Team**: [@adamdotdevin](https://github.com/adamdotdevin), [@jayair](https://github.com/jayair), [@fwang](https://github.com/fwang), [@rekram1-node](https://github.com/rekram1-node)
- **Major Contributors**: [@timoclsn](https://github.com/timoclsn), [@yordis](https://github.com/yordis), [@yihuikhuu](https://github.com/yihuikhuu), [@ezynda3](https://github.com/ezynda3), [@monotykamary](https://github.com/monotykamary), [@scaryrawr](https://github.com/scaryrawr), [@l0gicgate](https://github.com/l0gicgate)
- **And 130+ additional contributors**: See [full list](https://github.com/sst/opencode/graphs/contributors)

### Technology Note
OpenCode uses Claude's AI models via API but is **NOT developed by Anthropic**. It allows users to use Claude Pro and Max subscriptions. It's an independent open-source project created and maintained by the SST (Serverless Stack) team. This is an important distinction as OpenCode is provider-agnostic and can work with multiple AI providers including OpenAI, Google, and local models.

### OpenCode Recognition
- **Star the project**: https://github.com/sst/opencode ⭐
- **Website**: https://opencode.ai  
- **Documentation**: https://opencode.ai/docs
- **Community**: https://discord.gg/opencode

## Fork Enhancements

### What We Added
- **Full OpenCode Support**: Complete integration with OpenCode's usage tracking
- **Dual Source Tracking**: Distinguish between OpenCode `[O]` and Claude Code `[C]` usage
- **Project-Based Reporting**: New `project` command for project-level analysis
- **Enhanced Live Monitoring**: Improved real-time dashboard features
- **Advanced Filtering**: Enhanced date and project filtering capabilities
- **Unified Data Loading**: Combined data processing for both platforms

### Why We Forked
While the original ccusage project excellently serves Claude Code users, the introduction of OpenCode by the SST team created a need for:

1. **Unified Tracking**: Both OpenCode and Claude Code use the same Claude models and API
2. **Source Distinction**: Users need to see usage from both platforms separately
3. **Enhanced Analytics**: Project-based reporting and advanced monitoring
4. **Specialized Features**: Features specific to dual-platform usage patterns

This fork maintains full compatibility with the original ccusage while adding these essential features for users of both OpenCode and Claude Code.

## License Compatibility

Both the original ccusage and this fork (occusage) are released under the MIT License, ensuring full compatibility and proper attribution.

## Acknowledgments

We deeply appreciate the excellent foundation provided by [@ryoppippi](https://github.com/ryoppippi) and all contributors to the original ccusage project. This fork builds upon their outstanding work to serve the growing OpenCode community while maintaining support for Claude Code users.

### Original Project Recognition
- **Star the original**: https://github.com/ryoppippi/ccusage ⭐
- **Documentation**: https://ccusage.com/
- **Sponsor original author**: https://github.com/sponsors/ryoppippi
