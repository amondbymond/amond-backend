#!/bin/bash

echo "Starting INICIS Billing Test Server..."
echo "=================================="
echo ""
echo "Installing dependencies..."
npm install express body-parser axios

echo ""
echo "Starting server on port 3001..."
echo "Open http://localhost:3001/test-billing-complete.html in your browser"
echo ""

node test-billing-server.js