#!/bin/bash

# Test script for Phase 1 API endpoints
# Usage: ./test-api.sh [JWT_TOKEN] [ORG_ID]

API_URL="http://localhost:3001/api"
JWT_TOKEN="${1}"
ORG_ID="${2}"

echo "=========================================="
echo "🧪 Phase 1 API Testing"
echo "=========================================="
echo ""

# Test 1: Health Check (no auth required)
echo "1️⃣  Testing Health Check..."
curl -s "${API_URL}/health" | jq .
echo ""

# Test 2: Database Connection (no auth required)
echo "2️⃣  Testing Database Connection..."
curl -s "${API_URL}/health/db" | jq .
echo ""

if [ -z "$JWT_TOKEN" ]; then
  echo "⚠️  No JWT token provided. Skipping authenticated endpoints."
  echo ""
  echo "To test authenticated endpoints, run:"
  echo "./test-api.sh YOUR_JWT_TOKEN YOUR_ORG_ID"
  echo ""
  echo "Get your JWT token from browser dev tools:"
  echo "1. Open browser console on localhost:3000"
  echo "2. Run: localStorage.getItem('supabase.auth.token')"
  echo "3. Copy the access_token value"
  exit 0
fi

if [ -z "$ORG_ID" ]; then
  echo "⚠️  No ORG_ID provided. Skipping org-specific endpoints."
  echo ""
  echo "To test org-specific endpoints, run:"
  echo "./test-api.sh YOUR_JWT_TOKEN YOUR_ORG_ID"
  exit 0
fi

# Test 3: Get Current Subscription (requires auth)
echo "3️⃣  Testing Get Current Subscription..."
curl -s "${API_URL}/subscriptions/current?org_id=${ORG_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq .
echo ""

# Test 4: Get Subscription Status (requires auth)
echo "4️⃣  Testing Get Subscription Status..."
curl -s "${API_URL}/subscriptions/status?org_id=${ORG_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq .
echo ""

# Test 5: Check Can Create Resource (requires auth)
echo "5️⃣  Testing Can Create Environment..."
curl -s "${API_URL}/subscriptions/can-create?org_id=${ORG_ID}&resource_type=environment" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq .
echo ""

# Test 6: Check Entitlement (requires auth)
echo "6️⃣  Testing Check Entitlement..."
curl -s "${API_URL}/entitlements/check?org_id=${ORG_ID}&entitlement_key=environments_limit" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq .
echo ""

echo "=========================================="
echo "✅ Phase 1 Testing Complete!"
echo "=========================================="

