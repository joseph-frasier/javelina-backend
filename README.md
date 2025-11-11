# Javelina Backend API

A comprehensive, production-ready backend API for managing DNS zones and records in a multi-tenant, organization-based architecture. Built with TypeScript, Express.js, and Supabase, Javelina provides a robust foundation for DNS management with enterprise features including subscription billing, role-based access control, audit logging, and environment management.

## Overview

Javelina Backend is a RESTful API service designed to handle DNS zone and record management at scale. The application follows a hierarchical data model where organizations contain multiple environments, environments contain DNS zones, and zones contain DNS records. This structure enables teams to manage DNS configurations across different deployment environments (production, staging, development) while maintaining proper isolation and access controls.

### Key Features

- **Multi-Tenant Architecture**: Organizations can manage multiple environments and DNS zones with complete isolation
- **Role-Based Access Control**: Four-tier permission system (SuperAdmin, Admin, Editor, Viewer) for fine-grained access management
- **Environment Management**: Support for production, staging, and development environments with independent DNS configurations
- **DNS Zone Management**: Full CRUD operations for DNS zones with support for primary, secondary, and redirect zone types
- **DNS Record Management**: Comprehensive DNS record management supporting all major record types (A, AAAA, CNAME, MX, NS, TXT, SOA, SRV, CAA)
- **Subscription & Billing Integration**: Stripe integration for subscription management, plan management, and entitlement tracking
- **Audit Logging**: Complete audit trail of all changes to DNS records, zones, and organizational settings
- **User Profiles**: Extended user profile management with MFA support, SSO integration, and user preferences
- **Health Monitoring**: Built-in health check endpoints for monitoring and uptime tracking
- **Security**: Helmet.js for security headers, CORS configuration, request logging, and comprehensive error handling

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Payment Processing**: Stripe
- **Security**: Helmet.js, CORS
- **Logging**: Morgan
- **Deployment**: Vercel

## Project Structure

```
javelina-backend/
├── src/
│   ├── config/          # Configuration files (env, Supabase, Stripe)
│   ├── controllers/      # Business logic and request handlers
│   ├── middleware/       # Express middleware (auth, CORS, error handling, logging)
│   ├── routes/           # API route definitions
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions and helpers
│   └── index.ts          # Application entry point
├── .vscode/              # VS Code workspace settings
├── dist/                 # Compiled JavaScript output (generated)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── vercel.json           # Vercel deployment configuration
└── .gitignore           # Git ignore rules
```

## Prerequisites

Before running this application locally, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **npm** or **yarn** package manager
- **Supabase Account** with a project created
- **Stripe Account** (optional, for billing features)

## Environment Configuration

This application requires a `.env` file in the root directory with the following Supabase configuration keys. The application will not start without these essential environment variables.

### Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration (REQUIRED)
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Application Configuration
PORT=3001
NODE_ENV=development

# Frontend URL (required in production)
FRONTEND_URL=http://localhost:3000

# Stripe Configuration (optional, for billing features)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

### Obtaining Supabase Credentials

To run this application locally, you'll need to obtain the following credentials from your Supabase project:

1. **SUPABASE_URL**: Found in your Supabase project settings under "API" → "Project URL"
   - Format: `https://xxxxxxxxxxxxx.supabase.co`

2. **SUPABASE_ANON_KEY**: Found in your Supabase project settings under "API" → "Project API keys" → "anon public"
   - This is the public key used for client-side operations
   - Format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

3. **SUPABASE_SERVICE_ROLE_KEY**: Found in your Supabase project settings under "API" → "Project API keys" → "service_role"
   - ⚠️ **IMPORTANT**: This key has admin privileges and should NEVER be exposed to the client
   - Format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - Keep this key secure and never commit it to version control

### Environment Variable Details

- **SUPABASE_URL**: The base URL of your Supabase project. This is used to initialize the Supabase client and connect to your database and authentication services.

- **SUPABASE_ANON_KEY**: The anonymous/public key for Supabase. This key is used for operations that don't require elevated privileges and is safe to use in client-side code.

- **SUPABASE_SERVICE_ROLE_KEY**: The service role key that bypasses Row Level Security (RLS) policies. This key is used for administrative operations, user management, and operations that require elevated database access. **This key must be kept secret** and should only be used in server-side code.

- **PORT**: The port number on which the Express server will listen (defaults to 3001 if not specified).

- **NODE_ENV**: The environment mode (`development`, `production`, or `test`). Affects logging, error handling, and feature availability.

- **FRONTEND_URL**: The URL of your frontend application. Used for CORS configuration and redirects. Required in production environments.

- **STRIPE_SECRET_KEY**: Your Stripe secret API key (starts with `sk_`). Required only if you're using billing/subscription features.

- **STRIPE_WEBHOOK_SECRET**: Your Stripe webhook signing secret (starts with `whsec_`). Required for verifying Stripe webhook requests.

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd javelina-backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create `.env` file**:
   ```bash
   cp .env.example .env  # If you have an example file
   # Or create .env manually with the required Supabase keys
   ```

4. **Configure environment variables**:
   Edit the `.env` file and add your Supabase credentials as described above.

## Running the Application

### Development Mode

Run the application in development mode with hot-reloading:

```bash
npm run dev
```

The server will start on `http://localhost:3001` (or the port specified in your `.env` file).

### Production Mode

1. **Build the TypeScript code**:
   ```bash
   npm run build
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

### Type Checking

Run TypeScript type checking without building:

```bash
npm run type-check
```

## API Endpoints

The API is organized into the following route groups:

- **Health**: `/api/health` - Health check and status endpoints
- **Organizations**: `/api/organizations` - Organization management
- **Environments**: `/api/environments` - Environment management
- **Zones**: `/api/zones` - DNS zone management
- **DNS Records**: `/api/dns-records` - DNS record CRUD operations
- **Profiles**: `/api/profiles` - User profile management
- **Audit Logs**: `/api/audit-logs` - Audit log queries
- **Admin**: `/api/admin` - Administrative operations
- **Stripe**: `/api/stripe` - Stripe webhooks and billing
- **Subscriptions**: `/api/subscriptions` - Subscription management
- **Entitlements**: `/api/entitlements` - Feature entitlement checks
- **Plans**: `/api/plans` - Subscription plan management

### Root Endpoint

```bash
GET /
```

Returns API information including name, version, status, environment, and timestamp.

## Authentication

The API uses Supabase authentication. Most endpoints require authentication via Bearer token in the Authorization header:

```
Authorization: Bearer <supabase_jwt_token>
```

The authentication middleware validates tokens and attaches user information to the request object.

## Database Schema

The application expects the following main entities in your Supabase database:

- **organizations**: Top-level tenant containers
- **organization_members**: User-organization relationships with roles
- **environments**: Environment definitions within organizations
- **zones**: DNS zones within environments
- **dns_records**: DNS records within zones
- **profiles**: Extended user profile information
- **audit_logs**: Change tracking and audit trail
- **subscriptions**: Stripe subscription records
- **plans**: Subscription plan definitions
- **entitlements**: Feature access entitlements

Ensure your Supabase database schema matches these expected tables and relationships.

## Security Features

- **Helmet.js**: Sets various HTTP headers to help protect the app from well-known web vulnerabilities
- **CORS**: Configurable Cross-Origin Resource Sharing
- **Request Logging**: All requests are logged using Morgan
- **Error Handling**: Centralized error handling with proper status codes
- **Input Validation**: Request validation middleware
- **Authentication**: JWT-based authentication via Supabase
- **Role-Based Access**: Multi-level permission system

## Development

### Code Structure

- **Controllers**: Handle business logic and interact with Supabase
- **Routes**: Define API endpoints and middleware chains
- **Middleware**: Reusable Express middleware functions
- **Types**: TypeScript interfaces and type definitions
- **Utils**: Helper functions and utilities

### Adding New Features

1. Define types in `src/types/index.ts`
2. Create controller functions in `src/controllers/`
3. Define routes in `src/routes/`
4. Mount routes in `src/routes/index.ts`
5. Add any necessary middleware

## Deployment

The application is configured for deployment on Vercel. The `vercel.json` file contains the deployment configuration.

### Vercel Deployment

1. Connect your repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

Ensure all required environment variables are set in your Vercel project settings.

## Error Handling

The application uses a centralized error handling system with custom error classes:

- `AppError`: Base error class
- `AuthError`: Authentication failures (401)
- `ValidationError`: Request validation failures (400)
- `NotFoundError`: Resource not found (404)
- `ForbiddenError`: Permission denied (403)

All errors are caught by the global error handler and returned in a consistent format.

## Logging

Request logging is handled by Morgan middleware. All HTTP requests are logged with method, URL, status code, response time, and content length.

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure TypeScript compiles without errors (`npm run type-check`)
4. Test your changes locally
5. Submit a pull request

## License

ISC

## Support

For issues, questions, or contributions, please open an issue in the repository.

