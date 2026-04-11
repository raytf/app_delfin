# Delfin Design AI Spec

## What This Product Is

Delfin is a local, always-available learning companion that sits beside whatever the user is already doing on their computer.

The core use case is studying from slides, notes, PDFs, recorded lectures, problem sets, or any on-screen learning material. Instead of leaving the study flow, opening a browser tab, going to ChatGPT, uploading files, and manually re-explaining context, the user can ask for help directly from a small desktop overlay that already knows what they are looking at.

This is not meant to feel like a separate app that steals attention. It should feel like a second brain, a study partner, or a live agent/friend that stays in the background and can see the same thing the user is seeing.

## Delfin Persona

Delfin should have a clear product persona.

Delfin is:

- perceptive
- calm
- supportive
- intelligent without sounding academic or cold
- present in real time, like a thoughtful study partner
- encouraging without being overly cheerful
- helpful without feeling intrusive

Delfin should feel like someone sitting with you while you study, noticing what you are looking at and helping at the exact moment you need it. The product should feel companion-like, but still credible and sharp enough to support serious learning.

Important clarification:

- Delfin should not be designed as a human person
- do not frame Delfin as a human tutor, human avatar, or realistic assistant character
- Delfin should feel like a character presence, not a person
- the personality can be expressed through brand, interface behavior, motion, voice, and symbolism rather than a human face or human embodiment
- if any mascot or character language is explored, it should stay abstract, elegant, and brand-like rather than literal or anthropomorphic

The tone should avoid:

- robotic assistant energy
- hyper-corporate software energy
- childish mascot energy
- heavy sci-fi AI aesthetics
- human-assistant branding
- realistic human avatar systems
- product directions that make Delfin feel like a person on screen

The design should visibly express this persona.

That means:

- Delfin should feel like a calm ocean-intelligent presence
- the interface should feel observant, fluid, and reassuring
- the personality should come through in spacing, motion, color, and softness of surfaces
- the brand should feel inspired by dolphins and the ocean, but not in a literal cartoon way

Think:

- graceful
- fluid
- attentive
- bright
- calm
- intelligent

## Product Philosophy

The central idea is:

- learning support should be ambient, immediate, and non-disruptive
- the user should not have to break focus to get help
- the product should live beside the work, not replace it
- context should be captured from the screen in real time, not rebuilt manually every time
- the assistant should feel like it is studying with you, not like you are submitting tickets into a chatbot

The emotional promise is:

- "Stay in flow"
- "Ask while you study"
- "Get help in place"
- "Delfin sees what you see"

We are still deciding whether the framing should feel more like:

- an intelligent study agent
- a real-time study friend
- a supportive academic copilot

The design should work for all three directions, but it should clearly support the idea of real-time collaborative learning without pulling the user out of their notes or slides.

## How It Works

At a high level:

1. The user starts a session from a home screen.
2. The app minimizes into a compact always-on-top overlay.
3. When the user asks a question, the app captures the foreground window.
4. That screenshot plus the user’s text prompt is sent to a local on-device model.
5. The answer streams back token by token.
6. The user can keep asking follow-up questions in the same session.
7. In the expanded session view, the full conversation is visible like a chat thread.
8. Each user message can also open the screenshot that was captured when that prompt was sent.

Important product constraints:

- the model is local and privacy-first
- the product is meant to be faster and more lightweight than switching to a browser chatbot
- the UI should support both deep work and quick interruptions

## Interaction Model

There are two main modes:

- minimized overlay mode
- expanded session mode

The minimized overlay is for quick asks, fast glances, and live study flow.

The expanded session is for:

- reviewing the thread
- asking follow-up questions
- reading longer answers
- opening the screenshot context for earlier prompts

## Current Screens

### 1. Home Screen

Purpose:

- landing page before a session begins
- lightweight entry point into the product
- recent session overview when no session is active

Current data shown:

- product name: `Delfin`
- short product description
- primary CTA: `Start Session`
- recent sessions list if available

Recent session card data:

- source label or fallback title
- status
- message count
- start time
- end time

What this screen should communicate:

- this is a tool for focused study
- starting a session is fast and low-friction
- the product keeps continuity across sessions

### 2. Minimized Overlay: Compact State

Purpose:

- smallest always-on-top footprint
- stays out of the way until needed

Current controls:

- open prompt
- expand session
- end session

This is the "at rest" overlay state.

### 3. Minimized Overlay: Prompt Input State

Purpose:

- let the user ask a question quickly without opening the full app

Current elements:

- text input / composer
- send button
- compact overlay controls

This should feel frictionless and fast, almost like a command bar for learning help.

### 4. Minimized Overlay: Prompt Response State

Purpose:

- show the streaming answer in a small overlay panel
- keep the user in the study flow

Current elements:

- streaming response text
- loading state before first token
- `Ask Another` button
- `Expand` button
- overlay controls

Behavior:

- before first token, show only a centered loading indicator
- once tokens begin streaming, show the answer immediately
- auto-scroll as text streams
- after or during response, allow quick follow-up

This state is very important to the product identity. It should feel live, reactive, and lightweight.

### 5. Expanded Session View

Purpose:

- primary deep interaction screen
- full conversation review
- richer study context

Current layout:

- large header
- central conversation area
- prompt composer
- right sidebar for session controls and status

Current data shown in the header:

- active session label
- session description
- prompt count
- sidecar/local model connection status

Current data shown in the conversation thread:

- user messages
- assistant streamed/plain responses
- per-user-message `View Capture` action when a screenshot exists

Current data shown in the sidebar:

- minimize to overlay action
- end session action
- latest capture source label
- latest error if present

### 6. Capture Modal

Purpose:

- show the exact screenshot that was captured for a specific user prompt

Current behavior:

- launched from `View Capture` on a user message
- modal overlay on top of the expanded session
- shows prompt text context and the captured screenshot

This is a contextual evidence view. It should make the conversation feel grounded in what the user was actually looking at.

## Data Model The Designer Should Assume

Each session contains:

- session id
- start and end timestamps
- session status
- source label
- message count
- list of messages

Each message contains:

- message id
- role: user or assistant
- message content
- timestamp
- optional image path for user messages

Runtime UI state includes:

- whether the model is connected
- whether a response is currently streaming
- current overlay state
- current capture source label
- latest error message

## What The Product Should Feel Like

Desired qualities:

- calm
- intelligent
- focused
- intimate
- live
- useful
- not noisy
- not “enterprise dashboard”
- not generic chatbot UI
- light enough to feel breathable and calm
- warm enough to feel personal
- visually connected to ocean intelligence and motion

Avoid:

- looking like a web app stuffed into Electron
- looking like a normal support chat widget
- looking too much like a code assistant
- visual clutter
- too many boxes inside boxes
- very dark UI
- black-heavy surfaces as the default mood
- aggressive neon-on-dark aesthetics
- generic purple AI branding
- literal mascot/cartoon dolphin visuals

It should feel more like:

- a study companion
- an intelligent note margin
- a contextual tutor pinned to the edge of your work
- Delfin sitting beside you while you learn

## Design Goals

The design AI should optimize for:

- focus preservation
- quick question → quick response loop
- trust that the assistant is grounded in the current screen
- clear differentiation between minimized and expanded modes
- elegant presentation of streaming text
- a sense of continuity across a session
- a strong Delfin brand identity

Secondary goals:

- make recent sessions feel useful and worth returning to
- make capture context feel like a core capability, not a debug feature
- reinforce the “real-time companion” idea

## Visual Direction

The UI should be designed as a light-theme product.

This is important:

- do not make the product primarily dark
- do not default to black, charcoal, or near-black large surfaces
- favor light, airy, bright interfaces
- the product should feel open, focused, and calm during long study sessions

Primary color direction:

- use ocean blue as the main primary color
- the blue should subtly reference dolphins and the ocean
- secondary colors can include sea-glass tones, soft teals, pale sky blues, misty neutrals, and warm off-whites

The palette should evoke:

- clarity
- depth
- calm motion
- trust
- intelligence

The palette should not evoke:

- hacker aesthetics
- cyberpunk
- dark-mode developer tools
- generic AI startup purple gradients

Potential material and surface cues:

- soft white or warm pearl backgrounds
- light blue accents
- translucent oceanic layers
- subtle gradients inspired by water, horizon, or reflected light
- rounded surfaces that feel fluid rather than rigid

## Screens To Design

Please design all of the following:

1. Home screen with recent sessions
2. Minimized overlay, compact idle state
3. Minimized overlay, prompt input state
4. Minimized overlay, streaming response state
5. Expanded session screen
6. Capture modal

Optional bonus screens or states:

- empty recent sessions home state
- disconnected / error state
- no capture available state
- loading states
- hover/focus/pressed states for overlay controls

## Components The Design AI Should Propose

Please propose useful reusable components for this application, based on the context of a real-time screen-aware study assistant.

Examples of likely useful components:

- session card
- overlay control cluster
- compact prompt composer
- streaming response panel
- conversation bubble for user message
- conversation bubble for assistant message
- capture context button
- capture modal
- session status chip
- sidecar/model status indicator
- latest capture card
- persistent study header
- quick follow-up action row

Please also suggest additional components that are specific to this product and not generic chat apps.

## Design Directions To Explore

Please generate design ideas in a few distinct directions, for example:

- Direction A: calm academic copilot
- Direction B: live study friend
- Direction C: premium ambient desktop intelligence

For each direction, keep the product meaning the same, but vary:

- tone
- visual language
- typography
- density
- warmth vs precision

Across all directions:

- do not default to a very dark UI
- prefer bright, airy, calm palettes over black-heavy interfaces
- the product should feel focused and premium, but not nocturnal or intimidating
- anchor the brand around a light theme with ocean blue as the primary color
- make the product feel like Delfin, not a generic chat application

## Constraints

- desktop-first UI
- must work at small minimized overlay sizes and larger expanded sizes
- overlay must remain readable in a narrow area
- expanded session should support long conversations
- modal image preview should feel clean and focused
- avoid visual overload

## What To Output

Please produce:

1. A short interpretation of the product in your own words
2. A high-level design system direction
3. Screen designs for all listed screens
4. A component inventory
5. Optional interaction notes for transitions between minimized and expanded modes

If possible, explain:

- why your design choices fit this product philosophy
- how the UI supports focus and real-time learning
- what makes the product feel different from opening ChatGPT in a browser
