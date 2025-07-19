#!/usr/bin/env python3
"""
Instagram Image Scraper Service
Standalone service that can be called from Node.js
"""

import instaloader
import json
import sys
import base64
import requests
from io import BytesIO
from PIL import Image
import os
import tempfile
from typing import List, Dict, Optional


class InstagramImageScraper:
    def __init__(self):
        self.loader = instaloader.Instaloader(
            download_pictures=True,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            quiet=True,  # Suppress instaloader output
        )

    def image_to_base64(self, image_url: str) -> Optional[str]:
        """Convert image URL to base64 string"""
        try:
            response = requests.get(image_url, timeout=10)
            response.raise_for_status()

            # Convert to base64
            image_data = base64.b64encode(response.content).decode("utf-8")

            # Determine content type
            content_type = response.headers.get("content-type", "image/jpeg")

            return f"data:{content_type};base64,{image_data}"
        except Exception as e:
            print(f"Error converting image to base64: {e}", file=sys.stderr)
            return None

    def scrape_profile_images(self, username: str, max_posts: int = 5) -> Dict:
        """
        Scrape Instagram profile for images
        Returns profile picture + recent post images as base64
        """
        try:
            # Remove @ if present
            username = username.replace("@", "").strip()

            # Get profile
            profile = instaloader.Profile.from_username(self.loader.context, username)

            images = []

            # 1. Get profile picture
            if profile.profile_pic_url:
                profile_pic_b64 = self.image_to_base64(profile.profile_pic_url)
                if profile_pic_b64:
                    images.append(profile_pic_b64)

            # 2. Get recent posts
            posts_processed = 0
            for post in profile.get_posts():
                if posts_processed >= max_posts:
                    break

                try:
                    # Get the main image URL from the post
                    if hasattr(post, "url") and post.url:
                        post_image_b64 = self.image_to_base64(post.url)
                        if post_image_b64:
                            images.append(post_image_b64)
                            posts_processed += 1

                    # If it's a carousel (multiple images), get additional images
                    if hasattr(post, "get_sidecar_nodes"):
                        for sidecar in post.get_sidecar_nodes():
                            if posts_processed >= max_posts:
                                break
                            if hasattr(sidecar, "display_url") and sidecar.display_url:
                                sidecar_image_b64 = self.image_to_base64(
                                    sidecar.display_url
                                )
                                if sidecar_image_b64:
                                    images.append(sidecar_image_b64)
                                    posts_processed += 1

                except Exception as e:
                    print(f"Error processing post: {e}", file=sys.stderr)
                    continue

            return {
                "success": True,
                "images": images,
                "profile_info": {
                    "username": profile.username,
                    "full_name": profile.full_name,
                    "followers": profile.followers,
                    "posts_count": profile.mediacount,
                },
            }

        except instaloader.exceptions.ProfileNotExistsException:
            return {
                "success": False,
                "error": f"Profile @{username} does not exist or is private",
            }
        except instaloader.exceptions.ConnectionException as e:
            return {"success": False, "error": f"Connection error: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"Unexpected error: {str(e)}"}


def main():
    """Main function for CLI usage"""
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "Usage: python instagram_service.py <username> [max_posts]",
                }
            )
        )
        sys.exit(1)

    username = sys.argv[1]
    max_posts = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    scraper = InstagramImageScraper()
    result = scraper.scrape_profile_images(username, max_posts)

    # Output JSON result
    print(json.dumps(result))


if __name__ == "__main__":
    main()
