#! /usr/bin/env python3.12

import litert_lm
import os
import requests
from getpass import getpass

# Define the URL and local path
model_url = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm"
local_dir = "model"
local_path = os.path.join(local_dir, "gemma-4-E2B-it.litertlm")

# Ensure the directory exists
os.makedirs(local_dir, exist_ok=True)

# Check if the file already exists
if not os.path.exists(local_path):
    # Prompt the user for their Hugging Face token (hidden, supports copy/paste)
    hf_token = getpass(
        "Please paste your Hugging Face token and press Enter: ").strip()

    # Check if the token is provided
    if not hf_token:
        raise ValueError(
            "Hugging Face token is required to download the model.")

    print(f"Downloading model to {local_path}...")

    # Set up headers with the Hugging Face token
    headers = {"Authorization": f"Bearer {hf_token}"}

    try:
        # Stream the download to avoid memory issues
        response = requests.get(model_url, headers=headers, stream=True)
        response.raise_for_status()  # Raise an error for bad status codes

        # Save the file
        with open(local_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print("Download completed!")
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e}")
        print("Please check your Hugging Face token and permissions.")

# litert_lm.set_min_log_severity(litert_lm.LogSeverity.ERROR)  # Hide log for TUI app

# with litert_lm.Engine("model/gemma-3n-E2B-it-int4.litertlm") as engine:
#     with engine.create_conversation() as conversation:
#         while True:
#             user_input = input("\n>>> ")
#             for chunk in conversation.send_message_async(user_input):
#                 print(chunk["content"][0]["text"], end="", flush=True)

with litert_lm.Engine(
    "model/gemma-4-E2B-it.litertlm",
    # backend=litert_lm.Backend.GPU,
    audio_backend=litert_lm.Backend.CPU,
    vision_backend=litert_lm.Backend.GPU
) as engine:
    with engine.create_conversation() as conversation:
        user_message = {
            "role": "user",
            "content": [
                # {"type": "audio", "path": "/path/to/audio.wav"},
                {"type": "image", "path": "./lecture_slide_test.jpg"},
                {"type": "text", "text": "Describe this slide in detail"},
            ],
        }
        response = conversation.send_message(user_message)
        print(response["content"][0]["text"])
