# MASTER BUILD PROMPT — VISUAL INTELLIGENCE WORKSPACE

You are acting as a senior software architect, product designer, UX researcher, AI engineer, Chrome extension developer, and full-stack engineer.

Your task is to design and develop a complete, production-quality browser extension that transforms anything a user sees on their screen into useful knowledge, insights, comparisons, organized information, and actionable tasks.

Do not build another ordinary screenshot tool, OCR extension, or generic AI wrapper.

Build a genuinely useful product with a distinctive identity, thoughtful workflows, intelligent features, a polished interface, and an architecture that is maintainable and expandable.

---

# 1. PRODUCT VISION

The product's central idea is:

**See something → Capture it → Understand it → Connect it → Use it.**

The extension should allow users to capture any useful information they encounter online and transform it into something they can actually use.

Examples:

- Capture a programming error → understand the error and find a solution.
- Capture lecture slides → create notes, explanations, flashcards, and quizzes.
- Capture multiple products → compare them based on specifications.
- Capture research papers → combine findings and identify differences.
- Capture a job advertisement → extract requirements and identify skill gaps.
- Capture a table → extract structured data.
- Capture a mathematical equation → extract, explain, and solve it.
- Capture an event poster → extract event details and prepare a reminder.
- Capture a video frame → save the exact timestamp with contextual notes.
- Capture information across several websites → combine it into one intelligent workspace.
- Capture something important → automatically connect it to previously saved knowledge.

The product should feel like a personal visual intelligence and knowledge workspace, not simply an extension that stores screenshots.

## Product philosophy

- Local-first.
- Privacy-focused.
- Free to use for core functionality.
- AI optional rather than mandatory.
- Extremely useful without any AI provider connected.
- Support multiple AI providers and models.
- Easy to use without requiring users to understand technical concepts.
- Powerful features should be accessible without making the interface complicated.
- The best action should be immediately visible.
- Avoid unnecessary complexity and feature clutter.

---

# 2. BEFORE IMPLEMENTATION

Before writing or changing code:

1. Inspect the entire existing project.
2. Understand the current architecture.
3. Identify the framework, dependencies, manifest version, permissions, existing features, storage system, and UI structure.
4. Identify what already works.
5. Identify incomplete features, bugs, limitations, and architectural problems.
6. Reuse working code where appropriate.
7. Do not blindly rewrite the entire project.
8. Do not remove existing functionality without a clear reason.
9. Do not introduce unnecessary dependencies.
10. Create a clear implementation plan.

If this is an existing project, preserve functional components and focus on improving, expanding, and integrating them.

If this is a new project, create a clean, modular architecture.

Do not stop after presenting a plan. Continue implementing the product unless a genuinely blocking issue requires clarification.

---

# 3. UNIQUE PRODUCT IDENTITY AND UI DESIGN

This is one of the most important requirements.

I DO NOT want a generic AI-generated interface.

Avoid the common AI-generated design patterns:

- Generic purple/blue gradient backgrounds.
- Gradient text everywhere.
- Excessive rounded cards.
- Every element inside a card.
- Floating glass cards everywhere.
- Generic SaaS dashboard layouts.
- Unnecessary charts.
- Huge headings that waste space.
- Excessive empty space.
- Repetitive three-column layouts.
- Random decorative icons.
- Emoji used as interface icons.
- Excessive glowing borders.
- Excessive blur.
- Fake data and unnecessary dashboard metrics.
- Generic "AI-powered" badges everywhere.
- Every button looking equally important.
- Overdesigned interfaces that make simple tasks difficult.

The UI must look intentionally designed by an experienced product designer.

## Desired visual personality

Create a distinctive interface inspired by the combination of:

- Premium desktop software.
- Editorial information design.
- Modern research tools.
- Technical workspace interfaces.
- Refined productivity software.
- Subtle futuristic design.
- Clean information hierarchy.

The result should feel mature, intelligent, precise, premium, and memorable.

Do not copy any existing software design. Develop an original visual identity.

## Visual design language

Use:

- Carefully selected typography.
- Strong hierarchy.
- Asymmetrical layouts where appropriate.
- Subtle borders.
- Thin separators.
- Layered surfaces.
- Carefully controlled spacing.
- Compact but readable information.
- Consistent alignment.
- Purposeful iconography.
- Subtle transitions.
- Meaningful hover and focus states.
- Content-driven layouts.
- Occasional accent colors for important actions and information.

Use glassmorphism selectively.

Glass effects may be used for overlays, capture controls, floating contextual panels, and selected elements, but NOT everywhere.

The interface should not look like a glassmorphism template.

## Color system

Develop a complete design system with semantic color tokens.

The design must support:

- Background.
- Elevated background.
- Surface.
- Secondary surface.
- Borders.
- Text.
- Muted text.
- Primary accent.
- Secondary accent.
- Success.
- Warning.
- Error.
- Information.
- Focus.
- Hover.
- Active.
- Disabled.

The accent color should be distinctive but restrained.

Avoid overly saturated colors that dominate the interface.

Do not hardcode colors throughout individual components. Use a centralized design-token system.

---

# 4. DARK AND LIGHT THEMES

Implement two complete themes:

## Dark theme

Dark mode should use carefully layered surfaces rather than a single black background.

Use:

- Deep charcoal or graphite backgrounds.
- Slightly elevated surfaces.
- Softly differentiated panels.
- Readable primary text.
- Muted secondary text.
- Restrained accent color.
- Clear borders and focus states.

Do not simply invert the light theme.

Dark mode should feel professionally designed, comfortable for long sessions, and visually rich without unnecessary glow.

## Light theme

Light mode should not be plain white with gray cards.

Use:

- Warm white or subtle ivory backgrounds.
- Soft neutral surfaces.
- Carefully differentiated elevations.
- Dark readable typography.
- Restrained accent color.
- Elegant borders and separators.

Light mode should feel equally complete and premium.

## Theme functionality

Implement:

- Dark.
- Light.
- System preference.

Allow users to switch themes from Settings.

The theme preference must persist after closing and reopening the extension.

Theme switching should be immediate and smooth without flashing or reloading the entire interface.

Ensure every screen, overlay, dropdown, dialog, tooltip, input, and capture interface works correctly in both themes.

Do not design dark mode first and neglect light mode.

---

# 5. MAIN PRODUCT STRUCTURE

Create a clear and practical information architecture.

The main workspace should contain:

1. Capture.
2. Library.
3. Visual Memory.
4. Workspaces.
5. Study.
6. Monitor.
7. AI.
8. Settings.

Do not force all of these into a cluttered sidebar.

Choose the most appropriate navigation structure based on the extension's capabilities and screen size.

Prioritize the main capture workflow and library.

Secondary features should not overwhelm the core experience.

---

# 6. UNIVERSAL SMART CAPTURE

Create a powerful capture system.

Users should be able to:

- Capture any visible screen region.
- Select an area by dragging.
- Cancel capture.
- Adjust the selection.
- Preview before saving.
- Capture text, images, tables, code, charts, equations, webpages, and video frames.
- Add notes.
- Save temporarily or permanently.
- Choose a workspace or project.
- Copy extracted content.
- Export captured information.

The capture experience should be fast.

The capture overlay must be clean, precise, and easy to use.

Avoid a large complicated toolbar.

After capture, automatically analyze the content and recommend the most relevant action.

---

# 7. SMART CONTENT DETECTION

Detect the type of content inside a capture.

Possible categories include:

- Text.
- Article.
- Table.
- Spreadsheet-like content.
- Code.
- Programming error.
- Mathematical equation.
- Chart.
- Diagram.
- Product.
- Product comparison.
- Research paper.
- Lecture slide.
- Question.
- Job advertisement.
- Event poster.
- Contact information.
- Phone number.
- Email.
- QR code.
- URL.
- Receipt.
- Instructions.
- Conversation.
- Design.
- UI screenshot.

The system should understand more than the visual type.

For example:

Instead of detecting only:

"Text"

Try identifying:

"Python error message with a likely missing dependency."

Instead of:

"Image"

Try identifying:

"Product specification screenshot that can be used for comparison."

Instead of:

"Table"

Try identifying:

"Research results comparing four machine learning models."

The system should use OCR and structured rules first, with AI used when available.

Never require AI to perform basic content detection.

---

# 8. CONTEXTUAL ACTION SYSTEM

After a capture, present the most useful action first.

Examples:

### Programming error

- Explain error.
- Identify probable cause.
- Suggest a solution.
- Generate corrected code.
- Ask AI about the error.

### Lecture slide

- Explain simply.
- Create notes.
- Create flashcards.
- Create quiz.
- Connect with previous captures.

### Table

- Extract table.
- Copy CSV.
- Export Excel-compatible file.
- Summarize findings.
- Analyze data.

### Equation

- Extract equation.
- Explain variables.
- Solve step by step.
- Show related concepts.

### Product

- Extract specifications.
- Compare with another product.
- Save to comparison workspace.
- Identify missing information.

### Job listing

- Extract responsibilities.
- Extract qualifications.
- Identify required skills.
- Compare with a user's skill profile.
- Create a preparation checklist.

### Event poster

- Extract event name.
- Date.
- Time.
- Location.
- Website or contact.
- Prepare calendar entry.

### Research content

- Summarize.
- Extract methodology.
- Extract findings.
- Identify limitations.
- Compare with other research captures.

Do not show every possible action at once.

Show:

- One primary recommended action.
- Two or three useful secondary actions.
- An expandable More section.

The action system must be contextual and configurable.

---

# 9. MULTI-CAPTURE INTELLIGENCE WORKSPACE

This must be one of the product's strongest features.

Users should be able to collect multiple captures and analyze them together.

Examples:

- Compare five laptops.
- Combine ten lecture slides into a study document.
- Compare several research papers.
- Analyze multiple screenshots of an error.
- Compare competing software tools.
- Collect job advertisements.
- Combine multiple charts.
- Compare different designs.

Create a multi-capture workspace.

Users should be able to:

- Add captures.
- Remove captures.
- Reorder captures.
- Select multiple items.
- Combine content.
- Ask questions about all selected captures.
- Identify common information.
- Identify contradictions.
- Compare differences.
- Extract structured information.
- Generate summaries.
- Create comparison tables.
- Identify missing information.
- Generate recommendations based on user-defined criteria.

The AI must analyze the selected captures together rather than independently.

The workspace should have a clean interface that makes the relationship between captures easy to understand.

---

# 10. VISUAL MEMORY

Implement a system called Visual Memory.

This should go beyond screenshot history.

Every capture should have structured information when available:

- Original image.
- OCR text.
- Content description.
- Content category.
- Topic.
- Keywords.
- Source URL.
- Website name.
- Capture date.
- User notes.
- Workspace.
- Related captures.
- AI-generated summary.
- Important entities.
- Temporary or permanent status.

Automatically identify connections between captures.

For example:

A user captures:

- A machine learning lecture.
- A screenshot explaining neural networks.
- A research paper about deep learning.
- A Python example.

The extension should recognize that these may be related.

Allow users to:

- View related captures.
- Ask questions across related captures.
- Create topics.
- Create projects.
- Remove unwanted connections.
- Pin important information.
- Add notes.

Do not force users to manually organize everything.

Visual Memory should work automatically but remain controllable.

---

# 11. SEMANTIC SEARCH

Implement powerful search across the user's capture library.

Users should be able to search by:

- OCR text.
- Keywords.
- Topics.
- Source websites.
- Dates.
- Content categories.
- Notes.
- AI descriptions.
- Related concepts.
- Workspace.
- Projects.

Support natural-language search where possible.

Examples:

"Find the screenshot where I saved the React error about useEffect."

"Show me the laptop I was considering for video editing."

"Find the lecture slide explaining supervised learning."

"Show all research screenshots related to CNNs."

"Find the website where I saw the price comparison."

Search should return:

- Relevant capture.
- Preview.
- Short description.
- Relevance.
- Reason for matching.
- Source.
- Date.

The search interface should not depend entirely on AI.

Use local text indexing and semantic search where supported.

---

# 12. AI MODEL HUB

Create a modular AI provider system.

The extension must not be locked to one AI provider.

Support a provider architecture that can be expanded.

Potential providers:

- Ollama.
- LM Studio.
- Chrome built-in AI where available.
- User-provided API providers.
- Additional compatible local or cloud providers in the future.

## Local AI

Prioritize local AI through:

- Ollama.
- LM Studio.

Allow users to:

- Connect local AI.
- Select available models.
- Check connection.
- Test models.
- Select preferred models.
- Change models.
- Configure default models.

## Cloud AI

Allow optional user-provided API keys.

The developer must not pay for users' AI API usage.

API keys must be supplied by the user and handled securely.

Cloud AI should be completely optional.

Do not require a cloud account to use the core extension.

## AI model selection

Implement:

- Automatic model selection.
- Manual model selection.
- Provider selection.
- Task-specific model preferences.
- Model capability detection.
- Vision capability detection.
- Text capability detection.
- Code capability detection.
- Context size awareness where available.
- Connection status.
- Error handling.
- Fallback behavior.

Do not attempt to send images to models that cannot process images.

If a model is text-only:

1. Capture the image.
2. Run OCR locally.
3. Extract structured text.
4. Send text to the selected model when allowed.

## AI modes

### Auto mode

Automatically choose the best available model for the task.

### Manual mode

Let the user choose the model.

### Private mode

Only use local processing and local AI.

Never send captured information to a cloud provider when Private mode is enabled.

Clearly indicate when information is being sent to an external AI provider.

---

# 13. INTELLIGENT AI ROUTING

Create an AI routing system.

Do not use the most powerful model for every task.

Examples:

| Task | Preferred processing |
|---|---|
| OCR | Local OCR |
| QR detection | Local |
| Date extraction | Rules/local |
| URL extraction | Local |
| Basic classification | Local rules |
| Simple summary | Lightweight model |
| Translation | Local or suitable model |
| Code explanation | Coding-capable model |
| Complex reasoning | Strongest available model |
| Multi-capture comparison | Strong reasoning model |
| Sensitive information | Local-only when configured |
| Table extraction | OCR + local processing |
| Flashcard creation | Lightweight or suitable local AI |

AI routing should be configurable.

Users should be able to see why a particular model was selected when they want technical details.

Do not overcomplicate the normal user interface.

---

# 14. AI PROFILES

Create configurable AI profiles.

Examples:

### Study

- Simplified explanations.
- Step-by-step learning.
- Examples.
- Flashcards.
- Quiz generation.

### Developer

- Error diagnosis.
- Code explanation.
- Debugging.
- Code improvement.
- Technical reasoning.

### Research

- Summarization.
- Comparison.
- Methodology extraction.
- Findings.
- Limitations.
- Evidence organization.

### Writing

- Rewrite.
- Summarize.
- Improve clarity.
- Extract key points.

### Private

- Local-only processing.
- No external AI requests.

Users should be able to customize profiles and assign different models.

---

# 15. STUDY MODE

Create a dedicated learning system.

Users should be able to turn captures into:

- Study notes.
- Simple explanations.
- Detailed explanations.
- Step-by-step breakdowns.
- Flashcards.
- Multiple-choice quizzes.
- Short-answer questions.
- Practice questions.
- Concept summaries.
- Revision notes.
- Learning checklists.

## Learning gap detection

Analyze related captured material and identify missing prerequisite knowledge.

For example:

If a user captures content about decision trees but has no captured information about entropy or information gain, identify these as potentially useful prerequisite concepts.

Clearly distinguish between:

- Information found in the user's captures.
- Knowledge suggested by AI.

Never falsely imply that the user has studied a concept.

## Study workspace

Allow users to:

- Create notebooks.
- Add captures.
- Generate combined notes.
- Generate flashcards.
- Generate quizzes.
- Save progress.
- Review concepts.
- Revisit previous material.

Keep the learning interface focused and distraction-free.

---

# 16. VIDEO INTELLIGENCE

Support capturing useful information from online videos.

When a user captures a video frame, save:

- Screenshot.
- Video URL.
- Timestamp.
- Video title when available.
- Extracted text.
- User notes.
- AI explanation.
- Related captures.

Generate a timestamped resume link where the source video supports it.

Users should be able to search:

"Show me the part of the lecture where the instructor explained backpropagation."

Allow captures from the same video to be grouped together.

Video captures should become part of Visual Memory.

Do not pretend the extension can access video transcripts or content if the website does not expose them.

---

# 17. CAPTURE AND COMPARE

Create a capture comparison system.

Users can save a baseline capture and later capture the same page or content again.

Identify meaningful differences:

- Text added.
- Text removed.
- Numbers changed.
- Prices changed.
- Dates changed.
- Deadlines changed.
- Availability changed.
- Status changed.
- Requirements changed.
- Important information changed.

Allow users to choose what matters.

Examples:

- Compare any changes.
- Important changes only.
- Price changes.
- Availability.
- Dates and deadlines.
- Numeric changes.

Show:

- Original.
- New.
- Difference.
- Explanation.
- Importance.

Avoid notifying users about meaningless visual changes such as font adjustments or minor layout shifts when the actual information remains the same.

---

# 18. WEBSITE MONITORING

Allow users to monitor selected content.

Users should be able to:

- Capture a section.
- Save it as a baseline.
- Monitor it.
- Choose monitoring frequency.
- Select meaningful change categories.
- Pause monitoring.
- Resume monitoring.
- Delete monitoring rules.

Potential use cases:

- Price monitoring.
- Job listing changes.
- Research updates.
- Product availability.
- Application deadlines.
- Website content changes.
- Software documentation updates.

Notifications should be meaningful and configurable.

Monitoring must be technically feasible within Chrome extension restrictions.

Clearly explain limitations where pages require login, dynamic loading, CAPTCHA, blocked access, or unsupported content.

---

# 19. PRIVACY SHIELD

Implement privacy-first capture processing.

Detect sensitive information when possible:

- Email addresses.
- Phone numbers.
- Personal identification numbers.
- API keys.
- Tokens.
- Password-like information.
- Payment information.
- Sensitive account information.

Allow users to:

- Review detections.
- Redact selected information.
- Blur selected regions.
- Hide sensitive text.
- Prepare a safe version before sharing.

Do not automatically remove original information without the user's consent.

Private mode must enforce local-only processing.

The user should be able to understand where their data is stored and where it is sent.

---

# 20. STORAGE MANAGEMENT

The extension must be efficient and suitable for long-term use.

Implement:

- Local storage.
- IndexedDB where appropriate.
- Image optimization.
- Duplicate detection.
- Similar-capture detection.
- Storage usage visualization.
- Capture size information.
- Temporary captures.
- Expiration.
- Pinned captures.
- Workspace storage.
- Export.
- Backup.
- Import.

## Smart cleanup

Identify:

- Duplicate captures.
- Large unnecessary images.
- Old temporary captures.
- Unused unpinned captures.
- Similar captures.
- Captures that can be safely reviewed for removal.

Provide recommendations.

Never silently delete important user content.

All bulk deletions must have confirmation and a preview.

---

# 21. WORKSPACES AND PROJECTS

Allow users to group information naturally.

Examples:

- University.
- Research.
- Software Development.
- Project A.
- Shopping.
- Career.
- Personal Learning.

Each workspace may contain:

- Captures.
- Notes.
- Related topics.
- Comparisons.
- AI conversations.
- Study materials.
- Monitoring items.

Do not make manual folder management mandatory.

Automatically suggest workspaces and topics where appropriate.

---

# 22. UX AND INTERACTION REQUIREMENTS

The product must be easy for a first-time user.

Prioritize:

- One-click capture.
- Clear actions.
- Minimal friction.
- Predictable navigation.
- Fast loading.
- Clear feedback.
- Useful empty states.
- Helpful error states.
- Simple onboarding.

Every screen must have a purpose.

Avoid unnecessary confirmation dialogs for harmless actions.

Use confirmation only for important or destructive actions.

Implement:

- Loading states.
- Empty states.
- Error states.
- Offline states.
- AI unavailable states.
- Local model disconnected states.
- No search results.
- Storage full states.
- Permission errors.

Errors must tell users what they can do next.

---

# 23. EXTENSION UI COMPONENTS

Develop reusable components including:

- Capture overlay.
- Selection rectangle.
- Capture toolbar.
- Capture preview.
- Smart action panel.
- Library item.
- Capture details.
- Search.
- Workspace selector.
- Topic selector.
- AI model selector.
- AI provider settings.
- Theme selector.
- Settings sections.
- Modal.
- Confirmation dialog.
- Notification.
- Tooltip.
- Dropdown.
- Context menu.
- Comparison view.
- Multi-capture workspace.
- Study interface.
- Monitoring interface.
- Storage dashboard.

All components must follow the same design system.

Do not create inconsistent styles across different screens.

---

# 24. RESPONSIVE AND ACCESSIBLE DESIGN

The extension should work across its intended Chrome extension surfaces.

Design appropriately for:

- Popup.
- Side panel.
- Capture overlay.
- Settings.
- Full workspace views.

Do not simply scale the same layout everywhere.

Ensure:

- Keyboard navigation.
- Focus management.
- Accessible labels.
- Visible focus indicators.
- Readable contrast.
- Reduced-motion support.
- Proper interaction states.
- Screen reader-friendly structure where possible.

---

# 25. TECHNICAL ARCHITECTURE

Create a modular architecture.

Separate:

- UI.
- Capture.
- OCR.
- Detection.
- AI providers.
- AI routing.
- Storage.
- Search.
- Visual Memory.
- Workspaces.
- Study.
- Monitoring.
- Privacy.
- Export.
- Settings.
- Notifications.

Avoid giant files.

Avoid unnecessary abstractions.

Use clean interfaces between modules.

The AI provider system should allow adding new providers without rewriting the core application.

The OCR system should work independently of AI.

The capture system should work independently of AI.

The storage system should work independently of AI.

The search system should have useful basic functionality without requiring an embedding model.

---

# 26. PERFORMANCE

The extension should feel fast.

Requirements:

- Avoid blocking the UI.
- Optimize large images.
- Lazy-load where appropriate.
- Avoid unnecessary rendering.
- Avoid repeatedly processing the same captures.
- Cache reusable results.
- Use background processing where appropriate.
- Avoid excessive memory usage.
- Handle large capture libraries.
- Make search responsive.

Users should not need a powerful computer just to use basic features.

Advanced local AI may require additional hardware, but the core extension should remain lightweight.

---

# 27. OFFLINE AND FAILURE HANDLING

The extension must remain useful without internet access.

Offline capabilities should include, where technically possible:

- Capture.
- OCR.
- QR detection.
- Basic content detection.
- Text extraction.
- Search.
- Storage.
- Workspace management.
- CSV extraction.
- Basic comparisons.
- Privacy detection.

If AI is unavailable:

- Do not crash.
- Do not disable the extension.
- Show available local actions.
- Explain why AI is unavailable.
- Offer a way to reconnect or select another provider.

If Ollama or LM Studio is disconnected, show a clear connection status and recovery action.

If a model cannot handle a task, select an appropriate fallback or explain the limitation.

---

# 28. SECURITY

Implement security best practices.

- Minimize permissions.
- Avoid unnecessary host permissions.
- Do not expose API keys.
- Avoid unsafe HTML rendering.
- Validate external input.
- Sanitize extracted content.
- Secure storage of user settings.
- Avoid sending capture data without user awareness.
- Prevent accidental cloud processing in private mode.
- Avoid executing extracted code automatically.
- Require user confirmation before actions with external consequences.

---

# 29. DESIGN QUALITY CONTROL

Before considering the interface finished, conduct a full visual audit.

Evaluate:

### Visual identity
Does it look like a unique product or a generic AI-generated dashboard?

### Hierarchy
Can users immediately understand what matters?

### Information density
Is space used intelligently?

### Typography
Are fonts, sizes, weights, and line heights consistent?

### Layout
Are elements positioned intentionally?

### Consistency
Do buttons, dialogs, inputs, menus, and panels share a design language?

### Theme quality
Are dark and light themes both professionally designed?

### Functionality
Do all visible controls actually work?

### Empty states
Are empty pages designed rather than neglected?

### Accessibility
Are contrast, focus, keyboard navigation, and reduced motion supported?

### Performance
Does the interface feel responsive?

If a component looks like it came from a generic AI-generated UI template, redesign it.

---

# 30. FUNCTIONALITY QUALITY CONTROL

Do not create buttons that are merely decorative.

Every visible action must:

- Work.
- Have a clear purpose.
- Provide feedback.
- Handle errors.
- Respect user settings.

Do not leave fake functionality.

Do not present placeholder results as real AI output.

Do not use fake data in the production interface.

If a feature is not yet implemented, clearly identify it during development rather than pretending it works.

---

# 31. DEVELOPMENT APPROACH

Work in stages.

## Stage 1 — Project analysis

Understand the project, identify existing functionality, architecture, dependencies, and limitations.

## Stage 2 — Product architecture

Define modules, data structures, AI providers, storage, capture pipeline, and interaction flow.

## Stage 3 — Design system

Build the visual foundation:

- Design tokens.
- Typography.
- Spacing.
- Components.
- Icons.
- Dark theme.
- Light theme.
- Motion.
- Interaction states.

## Stage 4 — Core capture

Implement reliable capture and selection.

## Stage 5 — OCR and intelligence

Implement local OCR, content classification, extraction, and contextual actions.

## Stage 6 — AI providers

Implement local providers, model selection, auto routing, manual selection, profiles, private mode, and optional BYOK providers.

## Stage 7 — Library and Visual Memory

Implement captures, search, connections, topics, workspaces, and multi-capture intelligence.

## Stage 8 — Study and comparison

Implement study tools, comparison, notebooks, and video capture.

## Stage 9 — Monitoring and storage

Implement monitoring, smart cleanup, storage analytics, expiration, and duplicate detection.

## Stage 10 — Quality assurance

Test the entire application.

Fix bugs, incomplete interactions, UI inconsistencies, performance problems, and permissions issues.

---

# 32. FINAL EXPECTATIONS

The final product must not be a prototype that merely looks impressive.

It should be a working, thoughtfully designed, modular extension.

Prioritize quality over rushing.

Do not unnecessarily ask me to approve every small decision.

Make sensible decisions independently and keep a clear record of major architectural decisions.

If a feature is too complex to complete safely within the current implementation, implement the strongest usable foundation and document exactly what remains.

Do not pretend incomplete functionality is finished.

Do not remove functionality to make the interface simpler.

The final product should combine:

- A unique premium interface.
- Dark and light themes.
- Intelligent screen capture.
- Offline OCR.
- Smart content recognition.
- Contextual actions.
- Local AI.
- Model switching.
- Automatic AI routing.
- Optional cloud AI using the user's own API keys.
- Visual Memory.
- Multi-capture intelligence.
- Semantic search.
- Workspaces.
- Study mode.
- Video capture.
- Capture comparison.
- Website monitoring.
- Privacy Shield.
- Smart storage management.

The most important features that must receive exceptional attention are:

1. **Visual Memory** — captured information becomes connected knowledge.
2. **AI Model Hub** — users are not locked into a single AI model.
3. **Multi-Capture Intelligence** — multiple captures can be analyzed as one meaningful task.
4. **Smart Capture** — capturing information and finding the best action must be fast.
5. **UI/UX** — the interface must look original, premium, and deliberately designed rather than AI-generated.

Build this as a product people would genuinely want to keep installed and use every day.

Before finishing, provide:

- What was implemented.
- Architecture overview.
- Features completed.
- Features that remain incomplete.
- How to run the extension.
- How to connect Ollama.
- How to connect LM Studio.
- How to configure AI models.
- Known limitations.
- Testing results.
- Performance or security concerns.

**Do not stop at the design. Build the actual functional product.**