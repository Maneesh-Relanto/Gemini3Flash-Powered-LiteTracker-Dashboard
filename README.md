
# LiteTrack

A lightweight, privacy-focused web analytics suite featuring real-time event simulation, AI traffic insights, and seamless Cloudflare Worker integration.

## Overview

LiteTrack is a community-driven analytics utility designed for developers who value privacy and performance. It provides core web metrics without heavy dependencies or intrusive tracking.

## Key Features

- **Privacy-First Design:** Zero cookies, zero bloated scripts. Focus on clean data.
- **Event Simulator:** Verify your data pipeline in real-time before deploying to production.
- **AI Intelligence:** Powered by Gemini 3 Flash to deliver automated traffic summaries and engagement tips.
- **Developer-Native:** Built specifically for Cloudflare Workers with a ready-to-use receiver template.

## Getting Started

### 1. Installation
Integrate the provided tracking snippets into your website. LiteTrack supports Beacon API, Fetch, and legacy XHR.

### 2. Deployment
Use the **Deployment** tab in the dashboard to copy the Cloudflare Worker template and set up your own data endpoint in seconds.

### 3. Simulation
Input your worker URL into the dashboard to start sending test traffic and verify your setup.

## Security

LiteTrack requires a Google Gemini API key for automated insights. 
- Set your `API_KEY` environment variable in your local or production environment.
- **Open Source Safety:** Ensure keys are never committed to version control.

## License

Distributed under the MIT License.

---
*Built for the community. Powered by simplicity.*
