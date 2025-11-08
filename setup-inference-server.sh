#!/bin/bash

# Update package lists
sudo apt-get update

# Install python3-pip
sudo apt-get install -y python3-pip

# Install inference-cli (use --user to install in user directory)
pip3 install --user inference-cli

# Add user's local bin to PATH if not already there
export PATH="$HOME/.local/bin:$PATH"

# Check if inference command is available
if command -v inference &> /dev/null; then
    echo "Starting inference server..."
    inference server start
else
    echo "Trying to find inference command..."
    # Try using python module directly
    if python3 -m inference --help &> /dev/null; then
        echo "Using python3 -m inference..."
        python3 -m inference server start
    else
        echo "Error: inference command not found."
        echo "Please try running manually:"
        echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo "  inference server start"
        echo ""
        echo "Or use:"
        echo "  python3 -m inference server start"
    fi
fi

