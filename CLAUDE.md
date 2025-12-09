# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HorizonsRecorder is a React-based radio management system with AI-powered recording capabilities. The application allows users to manage radio stations, schedule recordings, and perform AI-assisted editing of audio content.

## Common Commands

- **Development server**: `npm run dev`
- **Build for production**: `npm run build` 
- **Preview build**: `npm run preview`
- **Lint code**: `npm run lint` (if configured - check package.json scripts)

## Architecture

### Frontend Stack
- **React 18** with JSX
- **Vite** as build tool and dev server
- **React Router DOM** for client-side routing
- **Tailwind CSS** for styling with custom components
- **Framer Motion** for animations
- **Supabase** for authentication and backend services
- **Radix UI** components for accessible UI primitives

### Key Directories
- `src/pages/` - Main application pages (Dashboard, Gravacoes, EdicaoIA, etc.)
- `src/components/` - Reusable React components
- `src/components/ui/` - UI component library (shadcn/ui style)
- `src/contexts/` - React contexts (SupabaseAuthContext)
- `src/lib/` - Utility functions and configurations
- `plugins/visual-editor/` - Custom Vite plugins for inline editing capabilities

### Authentication & State Management
- Uses Supabase for authentication with custom wrapper in `SupabaseAuthContext.jsx`
- Protected routes handled by `ProtectedRoute` component
- Global audio player state managed in App.jsx
- Custom Supabase client configured in `src/lib/customSupabaseClient.js`

### Audio System
- Dual audio player system: GlobalAudioPlayer for recordings and AudioPlayer for radio streams
- HLS.js integration for streaming audio
- Volume and playback state management

### Special Features
- Custom visual editor plugins for inline editing during development
- Error handling with custom Vite overlay modifications
- Console error monitoring and runtime error handling
- CORS and embedding support configured

### Routing Structure
All routes are protected except `/login` and `/cadastro-usuario`:
- `/dashboard` - Main dashboard
- `/painel` - Radio panel with live streaming
- `/gravacoes` - Recordings management
- `/edicao-ia` - AI editing features
- `/agendamentos` - Scheduling system
- `/cadastro-radios` - Radio station management

### Component Patterns
- Uses `@/` alias for src directory imports
- Follows shadcn/ui component patterns
- Motion components for page transitions
- Toast notifications via custom hook
- Consistent prop passing patterns for audio players

### Development Environment
- Custom Vite plugins active only in development mode
- Error overlay customizations for better development experience
- Visual editing capabilities during development
- Hot module replacement configured