# Request Size Limits Configuration

## Current Limits:
- Nginx: 100MB
- Express: 50MB
- Timeout: 120 seconds

## Calculation Formula:
For image uploads via base64:
- Actual size = (image_size × 1.33) × number_of_images
- 5 images @ 1MB each = ~6.65MB request
- 10 images @ 2MB each = ~26.6MB request
- 20 images @ 2MB each = ~53.2MB request

## Recommended Limits by Use Case:

### Conservative (Better Performance):
- Nginx: 50MB
- Express: 50MB
- Max images: 10 @ 2MB each

### Balanced (Current):
- Nginx: 100MB
- Express: 50MB (should match Nginx)
- Max images: 15 @ 3MB each

### Aggressive (Potential Issues):
- Nginx: 200MB
- Express: 200MB
- Max images: 30 @ 3MB each
- Risk: Memory issues, timeouts, OpenAI API rejections

## Alternative Solutions:

1. **Direct S3 Upload**:
   - User uploads images directly to S3
   - Send only S3 URLs to backend
   - No size limits, better performance

2. **Image Compression**:
   - Compress images client-side before base64 encoding
   - Can reduce size by 50-80%

3. **Chunked Upload**:
   - Split large requests into smaller chunks
   - Process images in batches

4. **Streaming**:
   - Use multipart/form-data instead of JSON
   - Stream images instead of loading all into memory