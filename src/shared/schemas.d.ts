import { z } from 'zod';
export declare const wsInboundMessageSchema: z.ZodObject<{
    type: z.ZodEnum<{
        token: "token";
        audio_start: "audio_start";
        audio_chunk: "audio_chunk";
        audio_end: "audio_end";
        done: "done";
        error: "error";
    }>;
    text: z.ZodOptional<z.ZodString>;
    audio: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    sample_rate: z.ZodOptional<z.ZodNumber>;
    sentence_count: z.ZodOptional<z.ZodNumber>;
    index: z.ZodOptional<z.ZodNumber>;
    tts_time: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const wsOutboundMessageSchema: z.ZodObject<{
    image: z.ZodOptional<z.ZodString>;
    text: z.ZodString;
    preset_id: z.ZodString;
    audio: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const wsInterruptMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"interrupt">;
}, z.core.$strip>;
export declare const sessionPromptRequestSchema: z.ZodObject<{
    messageId: z.ZodString;
    text: z.ZodString;
    presetId: z.ZodEnum<{
        "lecture-slide": "lecture-slide";
        "generic-screen": "generic-screen";
    }>;
    audio: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const captureFrameSchema: z.ZodObject<{
    imageBase64: z.ZodString;
    width: z.ZodNumber;
    height: z.ZodNumber;
    capturedAt: z.ZodNumber;
    sourceLabel: z.ZodString;
}, z.core.$strip>;
export declare const sidecarStatusSchema: z.ZodObject<{
    connected: z.ZodBoolean;
    backend: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    visionTokens: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
