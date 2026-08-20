import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#475569')) # slate-600
        
        # Header (pages 2+)
        if self._pageNumber > 1:
            self.drawString(54, 755, "Specification-Driven Development (SDD) + Test-Driven Development (TDD) Guide")
            self.setStrokeColor(colors.HexColor('#cbd5e1')) # slate-200
            self.setLineWidth(0.5)
            self.line(54, 748, 558, 748)
            
        # Footer (all pages)
        self.setStrokeColor(colors.HexColor('#e2e8f0')) # slate-200
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 30, page_str)
        self.drawString(54, 30, "Agivant BOLT Documentation Series")
        self.restoreState()

def create_guide_pdf(filename):
    # Set document margins (0.75" left/right, 1" top/bottom for content printable area)
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    # Base stylesheet
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        alignment=1, # Center
        textColor=colors.HexColor('#1e3a8a'), # blue-800
        spaceAfter=10
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        alignment=1, # Center
        textColor=colors.HexColor('#0f172a'), # slate-900
        spaceAfter=8
    )
    
    desc_style = ParagraphStyle(
        'DocDesc',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=10,
        leading=14,
        alignment=1, # Center
        textColor=colors.HexColor('#475569'), # slate-600
        spaceAfter=15
    )
    
    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#1e3a8a'), # blue-800
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#0f172a'), # slate-900
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'), # slate-700
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'),
        leftIndent=20,
        firstLineIndent=-12,
        spaceAfter=4
    )
    
    code_text_style = ParagraphStyle(
        'CodeText',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor('#f8fafc') # slate-50
    )

    tip_text_style = ParagraphStyle(
        'TipText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#78350f') # amber-900
    )

    part_style = ParagraphStyle(
        'PartHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#1d4ed8'), # blue-700
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True
    )

    step_style = ParagraphStyle(
        'StepHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#15803d'), # green-700
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    story = []

    def code_box(code):
        # Escaping html symbols in code
        lines = code.strip('\n').split('\n')
        escaped_lines = []
        for line in lines:
            escaped = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            # Preserve leading spaces using non-breaking spaces
            leading_spaces = len(line) - len(line.lstrip(' '))
            if leading_spaces > 0:
                escaped = '&nbsp;' * leading_spaces + escaped.lstrip(' ')
            escaped_lines.append(escaped)
        
        content = '<br/>'.join(escaped_lines)
        p = Paragraph(content, code_text_style)
        t = Table([[p]], colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#0f172a')), # slate-900
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        return t

    def tip_box(text, bg_color='#fef3c7', border_color='#d97706'):
        p = Paragraph(text, tip_text_style)
        t = Table([[p]], colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(bg_color)),
            ('LINELEFT', (0,0), (0,-1), 3, colors.HexColor(border_color)),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        return t

    # ---------------- PAGE 1 ----------------
    story.append(Spacer(1, 10))
    story.append(Paragraph("Specification-Driven Development (SDD) + Test-Driven Development (TDD)", title_style))
    story.append(Paragraph("A Complete Beginner's Step-by-Step Guide", subtitle_style))
    story.append(Paragraph("A complete beginner's step-by-step guide — no prior experience needed", desc_style))
    
    story.append(Paragraph("This guide walks you through the entire process from a blank computer to building a feature the correct way — using GitHub's Spec Kit tool (specify-cli). Follow the steps in order. Every command you need to type is shown in a grey box exactly as you should type it.", body_style))
    story.append(Spacer(1, 4))
    
    story.append(Paragraph("Why use SDD before TDD?", h1_style))
    story.append(Paragraph("Traditional development often starts by writing code immediately, which can lead to misunderstood requirements and unnecessary rework. Specification-Driven Development (SDD) helps teams clearly define what needs to be built before implementation begins. Test-Driven Development (TDD) then ensures each requirement is implemented correctly through automated tests.", body_style))
    
    story.append(Paragraph("What You're About To Do", h1_style))
    story.append(Paragraph("Instead of jumping straight into writing code, this workflow makes you do three quick writing tasks first — a Spec (what to build), a Plan (how to build it), and a Task List (the order to build it in). Only after that do you write any code, and even then you write a small test BEFORE each piece of code, to prove the code actually works.", body_style))
    story.append(Paragraph("Think of it like building furniture from a kit: you read the instructions (Spec), check which tools you need (Plan), lay out the steps (Tasks), and then build one piece at a time, checking each piece fits before moving to the next (Tests).", body_style))
    
    story.append(Paragraph("Before You Start — What You Need", h1_style))
    story.append(Paragraph("Make sure you have these things ready. If you're missing one, ask a teammate or your IT/admin to help you install it.", body_style))
    
    story.append(Paragraph("• &nbsp; A computer with a terminal (Command Prompt / PowerShell on Windows, Terminal on Mac/Linux).", bullet_style))
    story.append(Paragraph("• &nbsp; Python installed (version 3.11 or newer).", bullet_style))
    story.append(Paragraph("• &nbsp; An editor/assistant to work in — this guide covers two: Antigravity (an AI-native editor) or VS Code with GitHub Copilot. Use whichever one your team has set up.", bullet_style))
    story.append(Spacer(1, 4))
    
    story.append(tip_box("<b>TIP:</b> Antigravity and VS Code both work fine with this workflow — you just need to tell Spec Kit which one you're using so the /speckit slash commands show up in the right place. That's covered in the \"Connect Spec Kit To Your Editor\" section below, right before Part B."))
    story.append(Spacer(1, 6))
    
    story.append(Paragraph("PART A — One-Time Setup", part_style))
    story.append(Paragraph("You only need to do Part A once per computer/project. After that, skip straight to Part B every time you start a new feature.", body_style))
    
    story.append(Paragraph("STEP 1 Install \"uv\" (the tool that installs everything else)", step_style))
    story.append(Paragraph("uv is a fast Python package manager. Open your terminal and type:", body_style))
    story.append(code_box("pip install uv"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Then check it installed correctly by typing:", body_style))
    
    story.append(PageBreak())

    # ---------------- PAGE 2 ----------------
    story.append(code_box("uv --version"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("You should see a version number printed (e.g. uv 0.x.x). If you see that, you're good — move to Step 2.", body_style))
    
    story.append(Paragraph("STEP 2 Install Spec Kit (\"specify-cli\")", step_style))
    story.append(Paragraph("This is the actual tool that gives you the workflow. Copy and paste this exact command:", body_style))
    story.append(code_box("uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.11.3"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Windows users only — if the command above doesn't run, use this version instead:", body_style))
    story.append(code_box("py -m uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.11.3"))
    
    story.append(Paragraph("STEP 3 Double-check the install worked", step_style))
    story.append(code_box("specify --version\nspecify check"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("\"specify --version\" shows the version number. \"specify check\" scans your computer and tells you if anything else needed is missing. Fix anything it flags before continuing.", body_style))
    
    story.append(Paragraph("STEP 4 Create your project folder", step_style))
    story.append(Paragraph("If you're starting a brand-new project, type (replace MY_PROJECT with your project's name):", body_style))
    story.append(code_box("uvx --from git+https://github.com/github/spec-kit.git specify init MY_PROJECT"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("If you already have a project folder open and just want to add Spec Kit to it, type instead:", body_style))
    story.append(code_box("specify init --here"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("If your folder already has files in it and the tool complains, add --force to skip the warning:", body_style))
    story.append(code_box("specify init --here --force"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("During this step, the tool will ask which AI coding assistant you use. Pick the one you have installed. This creates a hidden .specify folder plus some ready-made slash-command files.", body_style))
    
    story.append(PageBreak())

    # ---------------- PAGE 3 ----------------
    story.append(Paragraph("Connect Spec Kit To Your Editor (Antigravity or VS Code)", h1_style))
    story.append(Paragraph("Spec Kit needs to know which editor/assistant you're using, because that decides where it puts the /speckit slash commands. Do this once per project, right after Part A and before you start Part B.", body_style))
    story.append(Spacer(1, 4))
    
    story.append(tip_box("<b>WHAT'S A SLASH COMMAND:</b> A 'slash command' just means typing something starting with / (like /speckit.specify) directly into your assistant's chat box — not into the terminal.", bg_color='#fef3c7', border_color='#d97706'))
    story.append(Spacer(1, 6))
    
    story.append(Paragraph("If you're using Antigravity", h2_style))
    story.append(Paragraph("Run these two commands in your terminal to install and switch on the Antigravity integration:", body_style))
    story.append(code_box("# 1. Install the Antigravity integration\nspecify integration install agy\n\n# 2. Switch the project's integration to Antigravity\nspecify integration switch agy"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Running these removes any Copilot-specific prompt files and registers the /speckit commands under the .agents/skills/ folder instead — which is what makes them show up as slash commands directly inside your Antigravity chat.", body_style))
    
    story.append(Paragraph("If you're using VS Code (with GitHub Copilot)", h2_style))
    story.append(Paragraph("Run the matching pair of commands instead:", body_style))
    story.append(code_box("# 1. Install the GitHub Copilot integration\nspecify integration install copilot\n\n# 2. Switch the project's integration to Copilot\nspecify integration switch copilot"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("This registers the /speckit commands under the .github/prompts/ folder, which is the location GitHub Copilot Chat looks in inside VS Code. These prompt files are only visible to Copilot — not to Antigravity, and vice-versa — so only ever switch to the integration that matches the editor you're actually typing into.", body_style))
    story.append(Spacer(1, 4))
    
    story.append(tip_box("<b>TIP:</b> If you ever switch editors partway through a project (e.g. moving from VS Code to Antigravity), just re-run the \"switch\" command for the new one. You don't need to reinstall anything you already installed before."))
    
    story.append(PageBreak())

    # ---------------- PAGE 4 ----------------
    story.append(Paragraph("PART B — The 5 Steps For Every New Feature", part_style))
    story.append(tip_box("<b>Important:</b><br/>Spec Kit assists with generating specifications, plans, and task breakdowns, but developers should always review requirements, validate generated content, and remain responsible for implementation decisions.<br/>Do these steps, in order, every time you want to build a new feature. Steps 1-3 are typed into your assistant's chat window (not the terminal). Steps 4-5 are a manual, repeatable loop you run per task.", bg_color='#f8fafc', border_color='#64748b'))
    story.append(Spacer(1, 6))
    
    story.append(Paragraph("STEP 1 Write the Spec — describe WHAT you're building and WHY", step_style))
    story.append(Paragraph("In your assistant's chat, type:", body_style))
    story.append(code_box("/speckit.specify Add a login page where users can sign in with email and password"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Replace the example text with your own feature idea in plain English. Don't mention databases, frameworks, or code — just describe the feature the way you'd explain it to a non-technical friend: what the user sees, what they can do, and what \"done\" looks like. This creates a file called spec.md.", body_style))
    story.append(Paragraph("Before moving on, read spec.md and make sure it correctly captures what you meant. Ask your assistant to fix anything that's wrong.", body_style))
    
    story.append(Paragraph("STEP 2 Write the Plan — decide HOW it will be built", step_style))
    story.append(code_box("/speckit.plan"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("This turns your spec into a technical plan — which language, libraries, and folder structure will be used, and a rough outline of how it'll be tested. This creates plan.md. You don't need to write anything technical yourself — just review the plan and flag anything that looks off.", body_style))
    
    story.append(Paragraph("STEP 3 Break It Into Tasks — a to-do list", step_style))
    story.append(code_box("/speckit.tasks"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("This breaks the plan into a small, ordered checklist (tasks.md) — things like \"build the login form,\" \"connect it to the database,\" and so on. Each item is small enough to finish and test on its own.", body_style))
    
    story.append(Paragraph("STEP 4 Build It Yourself, Task by Task — Manual TDD Loop", step_style))
    story.append(tip_box("<b>IMPORTANT:</b> Do NOT run /speckit.implement. That command lets the AI build the whole feature by itself in one go. Instead, for real control and to actually learn the TDD loop, you drive it manually, one task/spec file at a time, using the steps below.", bg_color='#fee2e2', border_color='#ef4444'))
    story.append(Spacer(1, 4))
    
    story.append(Paragraph("For each individual task or sub-spec (e.g. \"002-product-selection\"), repeat this loop:", body_style))
    story.append(Paragraph("• &nbsp; a) Ask for the test file first — in your assistant's chat, type something like: \"Generate the next TDD file for 002-product-selection. Don't run the tests yourself — tell me when to run them in my terminal.\"", bullet_style))
    story.append(Paragraph("• &nbsp; b) The assistant creates a test file inside your project's tests folder (e.g. tests/product-selection.spec.ts), based on that task's spec — but writes no feature code yet.", bullet_style))
    story.append(Paragraph("• &nbsp; c) You run the tests yourself in the terminal:", bullet_style))
    story.append(code_box("npx ng test --watch=false"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("• &nbsp; d) RED — The new tests will fail (this is expected — the feature doesn't exist yet). Copy the failure output from your terminal and paste it back to your assistant.", bullet_style))
    story.append(Paragraph("• &nbsp; e) GREEN — Tell your assistant: \"These tests failed — write the minimal code needed to make them pass.\" It writes the feature code.", bullet_style))
    story.append(Paragraph("• &nbsp; f) Run the same command again to check:", bullet_style))
    
    story.append(PageBreak())

    # ---------------- PAGE 5 ----------------
    story.append(code_box("npx ng test --watch=false"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("• &nbsp; g) REFACTOR — If tests pass, ask your assistant to clean up the code (better names, remove duplication), then re-run the test command once more to confirm everything is still green.", bullet_style))
    story.append(Paragraph("• &nbsp; h) Repeat steps (a) through (g) for the next task/spec file, until every task in tasks.md has been built and tested this way.", bullet_style))
    story.append(Spacer(1, 4))
    
    story.append(tip_box("<b>WHY DO IT THIS WAY:</b> This keeps you in control of every test run — nothing executes in your terminal unless you explicitly run it. The assistant only writes files; you decide when to test.", bg_color='#f0fdf4', border_color='#22c55e'))
    story.append(Spacer(1, 6))
    
    story.append(Paragraph("STEP 5 Verify — make sure everything actually works", step_style))
    story.append(Paragraph("• &nbsp; Run the full test suite one more time and confirm nothing else broke:", bullet_style))
    story.append(code_box("npx ng test --watch=false"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("• &nbsp; Confirm the project still builds/compiles with no errors.", bullet_style))
    story.append(Paragraph("• &nbsp; Re-read the original spec.md and check the finished feature really matches what was asked for.", bullet_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Once all three are confirmed, the feature is done.", body_style))
    
    story.append(PageBreak())

    # ---------------- PAGE 6 ----------------
    story.append(Paragraph("If Requirements Change Later", h1_style))
    story.append(Paragraph("Don't edit the code directly first. Always update in this order: 1) update spec.md, 2) update the tests, 3) then update the code. This keeps your documentation and your code from ever drifting apart.", body_style))
    story.append(Spacer(1, 4))
    
    story.append(Paragraph("Quick Reference Checklist (Print This Page)", h1_style))
    
    story.append(Paragraph("One-Time Setup", h2_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; pip install uv", bullet_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.11.3", bullet_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; specify --version and specify check", bullet_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; specify init (or specify init --here)", bullet_style))
    
    story.append(Paragraph("Connect To Your Editor (pick one)", h2_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; Antigravity: specify integration install agy then specify integration switch agy", bullet_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; VS Code + Copilot: specify integration install copilot then specify integration switch copilot", bullet_style))
    
    story.append(Paragraph("Every New Feature", h2_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; 1. /speckit.specify — describe the feature in plain English", bullet_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; 2. /speckit.plan — let it generate the technical plan", bullet_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; 3. /speckit.tasks — let it break the plan into small tasks", bullet_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; 4. For each task: ask for the TDD file → run npx ng test --watch=false → paste failures back → ask for code → re-run → refactor → re-run", bullet_style))
    story.append(Paragraph("[ &nbsp; ] &nbsp; 5. Verify — run all tests, confirm build works, re-check against the spec", bullet_style))
    
    story.append(Paragraph("Common Beginner Mistakes to Avoid", h1_style))
    story.append(Paragraph("• &nbsp; Running /speckit.implement expecting it to build the whole feature safely — for this workflow, build manually task-by-task instead, so you stay in control of each test run.", bullet_style))
    story.append(Paragraph("• &nbsp; Writing or asking for code before a test exists for it — the rule is: no code without a failing test first.", bullet_style))
    story.append(Paragraph("• &nbsp; Mentioning specific technologies (like \"use MongoDB\") inside the Spec step — that belongs in the Plan step, not the Spec.", bullet_style))
    story.append(Paragraph("• &nbsp; Forgetting to switch the integration (agy vs copilot) when you change editors — the slash commands won't show up in the wrong one.", bullet_style))
    story.append(Paragraph("• &nbsp; Forgetting to re-run specify check after installing — it catches missing pieces before they cause confusing errors later.", bullet_style))
    
    story.append(Paragraph("Quick Workflow", h2_style))
    story.append(Paragraph("Idea &nbsp;→&nbsp; Specification &nbsp;→&nbsp; Plan &nbsp;→&nbsp; Tasks &nbsp;→&nbsp; Test (RED) &nbsp;→&nbsp; Code (GREEN) &nbsp;→&nbsp; Refactor &nbsp;→&nbsp; Verify", body_style))
    
    story.append(PageBreak())

    # ---------------- PAGE 7 ----------------
    story.append(Paragraph("Glossary — Terms Explained Simply", h1_style))
    story.append(Paragraph("• &nbsp; <b>Spec (spec.md):</b> A plain-English description of what a feature does and why it matters. No technical details.", bullet_style))
    story.append(Paragraph("• &nbsp; <b>Plan (plan.md):</b> The technical blueprint — languages, tools, and architecture used to build the spec.", bullet_style))
    story.append(Paragraph("• &nbsp; <b>Tasks (tasks.md):</b> A checklist breaking the plan into small, ordered, doable steps.", bullet_style))
    story.append(Paragraph("• &nbsp; <b>TDD (Test-Driven Development):</b> Writing a test before writing the code that makes it pass.", bullet_style))
    story.append(Paragraph("• &nbsp; <b>Red / Green / Refactor:</b> The three-step loop — write a failing test (Red), write code to pass it (Green), clean up the code (Refactor).", bullet_style))
    story.append(Paragraph("• &nbsp; <b>Slash command:</b> A command typed into your assistant's chat box, starting with a forward slash, e.g. /speckit.specify.", bullet_style))
    story.append(Paragraph("• &nbsp; <b>Integration (agy / copilot):</b> Tells Spec Kit which editor/assistant should see the /speckit slash commands.", bullet_style))
    story.append(Spacer(1, 4))
    
    story.append(Paragraph("Where These Files End Up", h1_style))
    story.append(Paragraph("After following this guide, your project folder will contain:", body_style))
    story.append(code_box(".specify/                 (Spec Kit's own templates &amp; scripts - don't edit)\n.agents/skills/           (slash commands - only if using Antigravity)\n.github/prompts/          (slash commands - only if using VS Code + Copilot)\nspecs/\n  001-your-feature-name/\n    spec.md               (Step 1 output)\n    plan.md               (Step 2 output)\n    tasks.md              (Step 3 output)\ntests/\n  your-feature.spec.ts    (created during Part B, Step 4 - run with npx ng test --watch=false)"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Each new feature you build gets its own numbered specs folder (002-, 003-, ...), so your history of specs stays alongside your code and tests forever.", body_style))

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)

if __name__ == '__main__':
    target_dir = r"c:\Users\GayathriAyyaluri\OneDrive - Agivant Technlogies India Pvt. Ltd\Desktop\NOS\documents"
    os.makedirs(target_dir, exist_ok=True)
    target_file = os.path.join(target_dir, "Specification-Driven Development (SDD) and Test-Driven Development (TDD) Guide.pdf")
    print(f"Generating PDF to: {target_file}")
    create_guide_pdf(target_file)
    print("Generation complete!")
