/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, ChangeEvent, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateProductShot, generatePromptSuggestion, generateAiModelShot } from './services/geminiService';
import { prepareImage, cropImage, dataURLtoBlob } from './lib/imageUtils';

// --- TYPE DEFINITIONS ---
type Mode = 'background' | 'ai-model';
type BackgroundSubMode = 'color' | 'scene';
type ServiceBackgroundSubMode = 'color' | 'scene' | 'transparent';
type Gender = 'Any' | 'Male' | 'Female';
type ModelSource = 'ai' | 'custom';
type LoadingStep = '' | 'Generating...' | 'Blending concepts...';
type AppTab = 'settings' | 'history';

interface ImageState {
  url: string | null;
  file: File | null;
  originalWidth: number;
  originalHeight: number;
}
interface PromptBuilderSettings {
    style: string;
    composition: string;
    lighting: string;
}
interface OperationStatus {
    isLoading: LoadingStep;
    error: string | null;
}
// State for features within the Background mode
interface BackgroundStatuses {
    color: OperationStatus;
    scene: OperationStatus;
    transparent: OperationStatus;
}
// State for features within the AI Model mode
interface AiModelStatuses {
    ai: OperationStatus;
    custom: OperationStatus;
}
interface AiModelPromptLoading {
    ai: boolean;
    custom: boolean;
}

// Snapshot of all settings at the time of generation
interface GenerationStateSnapshot {
    mode: Mode;
    backgroundSubMode: BackgroundSubMode;
    modelSource: ModelSource;
    backgroundColor: string;
    scenePrompt: string;
    aspectRatio: string;
    promptEnhancer: boolean;
    aiGeneratedPrompt: string;
    yourModelPrompt: string;
    gender: Gender;
    promptBuilder: PromptBuilderSettings;
    aiGeneratedPromptEnhancer: boolean;
    yourModelPromptEnhancer: boolean;
    productImageUrl: string | null;
    modelImageUrl: string | null;
}

// For session history panel
interface SessionGeneration {
    id: number;
    src: string | null;
    status: 'loading' | 'done';
    featureKey: keyof GenerationStacks;
    snapshot: GenerationStateSnapshot;
}
// For feature-specific undo/redo stacks
interface GenerationStack {
    images: string[];
    currentIndex: number;
}
type GenerationStacks = {
    'background-color': GenerationStack;
    'background-scene': GenerationStack;
    'background-transparent': GenerationStack;
    'ai-model-ai': GenerationStack;
    'ai-model-custom': GenerationStack;
};


// --- UI CONSTANTS ---
const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-xl shadow-[0_4px_10px_rgba(250,204,21,0.4)] transition-all duration-200 hover:bg-yellow-300 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed";
const panelStyles = "p-4 space-y-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl";
const labelStyles = "block font-permanent-marker text-neutral-300 text-sm tracking-wider mb-2";
const inputStyles = "w-full bg-black/40 border border-white/20 rounded-lg p-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-yellow-400";
const selectStyles = `${inputStyles} cursor-pointer`;


// --- ICON COMPONENTS ---
const InfoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const GenIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" {...props}><path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 001.84 1.84l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-1.84 1.84l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-1.84-1.84l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 001.84-1.84l.813 2.846A.75.75 0 019 4.5zM15.991 15.06a.75.75 0 01.581.422l.494 1.727a2.25 2.25 0 001.105 1.105l1.727.494a.75.75 0 010 1.342l-1.727.494a2.25 2.25 0 00-1.105 1.105l-.494 1.727a.75.75 0 01-1.342 0l-.494-1.727a2.25 2.25 0 00-1.105-1.105l-1.727-.494a.75.75 0 010-1.342l1.727-.494a2.25 2.25 0 001.105-1.105l.494-1.727a.75.75 0 01.76-.422z" clipRule="evenodd" /></svg>);
const UndoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>);
const RedoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>);
const StartOverIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>);
const BackgroundIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
);
const AiModelIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);
const HistoryPlaceholderIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
);
const DownloadIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>);
const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>);
const HistoryIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);
const CloseIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>);


// --- CHILD COMPONENTS ---

const LoadingIndicator = ({ step }: { step: LoadingStep }) => (
    <div className="flex flex-col items-center justify-center h-full text-center">
        <svg className="animate-spin h-8 w-8 text-yellow-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p className="font-permanent-marker text-yellow-400 text-lg">{step}</p>
    </div>
);

const UploadPlaceholder = ({ title, onUpload, imageUrl }: { title: string, onUpload: (file: File) => void, imageUrl?: string | null }) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onUpload(file);
        }
        e.target.value = '';
    };

    const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, isOver: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(isOver);
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        handleDragEvents(e, false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            onUpload(file);
        }
    };
    
    return (
        <label 
            className={`bg-neutral-800/60 rounded-2xl cursor-pointer relative flex flex-col items-center justify-center p-6 h-40 transition-all group overflow-hidden ${isDraggingOver ? 'border-yellow-400' : ''}`}
            onDragOver={(e) => handleDragEvents(e, true)}
            onDragEnter={(e) => handleDragEvents(e, true)}
            onDragLeave={(e) => handleDragEvents(e, false)}
            onDrop={handleDrop}
        >
            {/* This is the inner dashed border */}
            <div className={`absolute inset-2 border-2 border-dashed rounded-xl transition-all pointer-events-none ${isDraggingOver ? 'border-yellow-400/80' : 'border-white/30'}`}></div>

            {imageUrl && (
                <img src={imageUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover blur-sm opacity-20 group-hover:opacity-30 transition-opacity" />
            )}

            <div className="relative z-10 flex flex-col items-center text-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l5 5 5-5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3" />
                </svg>

                <span className="mt-4 font-permanent-marker text-lg text-neutral-100 drop-shadow-md uppercase">
                    {imageUrl ? `Change ${title}` : `Upload ${title}`}
                </span>
                <span className="text-sm text-neutral-400 mt-1">or drag and drop</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
    );
};


const getFileExtensionFromDataUrl = (dataUrl: string): string => {
    const mimeTypeMatch = dataUrl.match(/data:(image\/\w+);/);
    if (!mimeTypeMatch) return 'jpg';

    const mimeType = mimeTypeMatch[1];
    switch (mimeType) {
        case 'image/jpeg':
            return 'jpg';
        case 'image/png':
            return 'png';
        case 'image/gif':
            return 'gif';
        case 'image/webp':
            return 'webp';
        default:
            return 'jpg';
    }
};

const GenerationResult = ({ src, alt, onDownload }: { src: string; alt: string; onDownload: (src: string) => void }) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 relative group">
            <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-xl" />
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={() => onDownload(src)}
                    className="bg-yellow-400 text-black font-bold py-2 px-4 rounded-lg shadow-lg hover:bg-yellow-300 transition-colors flex items-center gap-2"
                    aria-label="Download Image"
                >
                    <DownloadIcon />
                    Download
                </button>
            </div>
        </div>
    );
};

const HistoryControls = ({ canUndo, canRedo, onUndo, onRedo, onStartOver }: { canUndo: boolean, canRedo: boolean, onUndo: () => void, onRedo: () => void, onStartOver: () => void }) => {
    return (
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm p-1 rounded-lg">
            <button onClick={onUndo} disabled={!canUndo} className="p-2 rounded-lg hover:bg-white/20 disabled:text-neutral-500 disabled:hover:bg-transparent disabled:cursor-not-allowed" title="Undo">
                <UndoIcon />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-2 rounded-lg hover:bg-white/20 disabled:text-neutral-500 disabled:hover:bg-transparent disabled:cursor-not-allowed" title="Redo">
                <RedoIcon />
            </button>
             <div className="w-px h-5 bg-white/20 mx-1"></div>
            <button onClick={onStartOver} className="p-2 rounded-lg text-red-400 hover:bg-red-900/50" title="Start Over">
                <StartOverIcon />
            </button>
        </div>
    );
};

// --- INITIAL STATES ---
const initialProductImage: ImageState = { url: null, file: null, originalWidth: 0, originalHeight: 0 };
const initialModelImage: ImageState = { url: null, file: null, originalWidth: 0, originalHeight: 0 };

const initialPromptBuilder: PromptBuilderSettings = {
    style: 'Photorealistic',
    composition: 'Medium Shot',
    lighting: 'Natural Light',
};

const initialOpStatus: OperationStatus = { isLoading: '', error: null };
const initialBackgroundStatuses: BackgroundStatuses = {
    color: initialOpStatus,
    scene: initialOpStatus,
    transparent: initialOpStatus,
};
const initialAiModelStatuses: AiModelStatuses = {
    ai: initialOpStatus,
    custom: initialOpStatus,
};
const initialAiModelPromptLoading: AiModelPromptLoading = {
    ai: false,
    custom: false,
};

const initialGenerationStack: GenerationStack = { images: [], currentIndex: -1 };
const initialGenerationStacks: GenerationStacks = {
    'background-color': { ...initialGenerationStack, images: [] },
    'background-scene': { ...initialGenerationStack, images: [] },
    'background-transparent': { ...initialGenerationStack, images: [] },
    'ai-model-ai': { ...initialGenerationStack, images: [] },
    'ai-model-custom': { ...initialGenerationStack, images: [] },
};

// --- REFACTORED VIEW COMPONENTS ---
const PromptEnhancerToggle = ({ isChecked, onChange }: { isChecked: boolean, onChange: () => void }) => (
    <div>
        <div className="flex items-center justify-between mb-2">
            <span className={labelStyles + ' mb-0'}>Prompt Enhancer</span>
            <div className="relative group">
                <InfoIcon className="cursor-help text-neutral-400" />
                <div className="absolute bottom-full right-0 mb-2 w-48 bg-neutral-800 text-neutral-200 text-xs rounded-lg py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                    Automatically enhances your prompt with professional photography terms for higher quality results.
                </div>
            </div>
        </div>
        <label htmlFor="optimizer-toggle" className="flex items-center cursor-pointer">
            <div className="relative">
                <input 
                    type="checkbox" 
                    id="optimizer-toggle" 
                    className="sr-only" 
                    checked={isChecked} 
                    onChange={onChange} 
                />
                <div className={`block w-14 h-8 rounded-full transition-colors ${isChecked ? 'bg-yellow-800' : 'bg-black/20'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isChecked ? 'transform translate-x-full bg-yellow-400' : ''}`}></div>
            </div>
        </label>
    </div>
);

const AspectRatioSelector = ({ aspectRatio, setAspectRatio }: { aspectRatio: string, setAspectRatio: (ar: string) => void }) => (
    <div>
        <label className={labelStyles}>Aspect Ratio</label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {['9:16', '4:5', '3:4', '1:1', '16:9', '4:3'].map(ar => (
                <button
                    key={ar}
                    onClick={() => setAspectRatio(ar)}
                    className={`flex items-center justify-center p-2 rounded-lg transition-colors duration-200 text-xs h-10 font-bold ${aspectRatio === ar ? 'bg-yellow-400 text-black' : 'bg-black/20 hover:bg-white/10'}`}
                >
                    {ar}
                </button>
            ))}
        </div>
    </div>
);

const SettingsPanelContent = (props: any) => {
    const {
        mode, handleSetMode, backgroundSubMode, handleSetBackgroundSubMode,
        uploadKey, handleFileUpload, productImage, modelImage, colorSwatches,
        backgroundColor, setBackgroundColor, aspectRatio, setAspectRatio,
        scenePrompt, setScenePrompt, handlePromptGen, isScenePromptLoading,
        backgroundStatuses, promptEnhancer, isEnhancerChecked, handleEnhancerChange,
        modelSource, handleSetModelSource, aiGeneratedPrompt, setAiGeneratedPrompt,
        yourModelPrompt, setYourModelPrompt, isAiModelPromptLoading, aiModelStatuses,
        gender, setGender, promptBuilder, handlePromptBuilderChange,
    } = props;
    
    return (
    <div className="space-y-4">
        <div className={panelStyles}>
            <label className={labelStyles}>Mode</label>
            <div className="grid grid-cols-2 gap-2">
                <button 
                    onClick={() => handleSetMode('background')} 
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-colors duration-200 h-24 font-semibold
                        ${mode === 'background' ? 'bg-yellow-400 text-black' : 'bg-black/40 hover:bg-white/10 text-neutral-300'}`
                    }
                >
                    <BackgroundIcon className="w-6 h-6 mb-2" />
                    <span>Background</span>
                </button>
                <button 
                    onClick={() => handleSetMode('ai-model')} 
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-colors duration-200 h-24 font-semibold
                        ${mode === 'ai-model' ? 'bg-yellow-400 text-black' : 'bg-black/40 hover:bg-white/10 text-neutral-300'}`
                    }
                >
                    <AiModelIcon className="w-6 h-6 mb-2" />
                    <span>AI Model</span>
                </button>
            </div>
        </div>

        <AnimatePresence mode="wait">
            <motion.div
                key={mode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
            >
                {mode === 'background' && (
                    <>
                    <UploadPlaceholder key={`product-upload-${uploadKey}`} title="Product" onUpload={(file) => handleFileUpload(file, 'product')} imageUrl={productImage.url} />
                    <div className={panelStyles}>
                        <div className="flex bg-black/20 rounded-lg p-1">
                            <button onClick={() => handleSetBackgroundSubMode('color')} className={`w-1/2 rounded-md py-2 text-sm font-bold transition-colors ${backgroundSubMode === 'color' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>Color</button>
                            <button onClick={() => handleSetBackgroundSubMode('scene')} className={`w-1/2 rounded-md py-2 text-sm font-bold transition-colors ${backgroundSubMode === 'scene' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>AI Scene</button>
                        </div>
                        <div className="relative">
                            <AnimatePresence mode="wait" initial={false}>
                                {backgroundSubMode === 'color' && (
                                    <motion.div
                                        key="background-color-panel"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className="space-y-4">
                                            <div>
                                                <label className={labelStyles + " uppercase"}>Background Color</label>
                                                <div className="flex items-center gap-3 w-full bg-black/40 border border-white/20 rounded-lg p-2 focus-within:ring-2 focus-within:ring-yellow-400 transition-shadow">
                                                    <label htmlFor="color-picker" className="relative w-9 h-9 rounded-full cursor-pointer shrink-0 border border-white/20">
                                                        <div 
                                                            className="w-full h-full rounded-full"
                                                            style={{
                                                                backgroundColor: backgroundColor === 'transparent' ? 'transparent' : backgroundColor,
                                                                backgroundImage: backgroundColor === 'transparent' ? `linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)` : 'none',
                                                                backgroundSize: '8px 8px',
                                                                backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
                                                            }}
                                                        ></div>
                                                        <input 
                                                            id="color-picker" 
                                                            type="color" 
                                                            value={backgroundColor === 'transparent' ? '#ffffff' : backgroundColor} 
                                                            onChange={(e) => setBackgroundColor(e.target.value)} 
                                                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                                                            aria-label="Custom color picker"
                                                        />
                                                    </label>
                                                    <input 
                                                        type="text" 
                                                        value={backgroundColor === 'transparent' ? 'transparent' : backgroundColor} 
                                                        onChange={(e) => setBackgroundColor(e.target.value)} 
                                                        className="w-full bg-transparent border-none text-neutral-200 placeholder:text-neutral-500 focus:outline-none disabled:bg-transparent disabled:text-neutral-500"
                                                        aria-label="Hex color value"
                                                        disabled={backgroundColor === 'transparent'}
                                                    />
                                                </div>
                                                <div className="grid grid-cols-6 gap-4 justify-items-center mt-4">
                                                    <div className="relative">
                                                        {backgroundColor === 'transparent' && <div className="absolute inset-[-4px] ring-2 ring-yellow-400 rounded-full" />}
                                                        <button
                                                            onClick={() => setBackgroundColor('transparent')}
                                                            className="h-9 w-9 rounded-full border border-white/20 transition-transform hover:scale-110 focus:outline-none relative overflow-hidden"
                                                            style={{
                                                                backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
                                                                backgroundSize: '10px 10px',
                                                                backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
                                                            }}
                                                            aria-label="Select transparent background"
                                                        />
                                                    </div>
                                                    {colorSwatches.map(swatch => 
                                                        <div key={swatch} className="relative">
                                                            {backgroundColor === swatch && <div className="absolute inset-[-4px] ring-2 ring-yellow-400 rounded-full" />}
                                                            <button 
                                                                onClick={() => setBackgroundColor(swatch)} 
                                                                className="h-9 w-9 rounded-full border border-black/20 transition-transform hover:scale-110 focus:outline-none" 
                                                                style={{ backgroundColor: swatch }} 
                                                                aria-label={`Select color ${swatch}`}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {backgroundColor !== 'transparent' && <AspectRatioSelector aspectRatio={aspectRatio} setAspectRatio={setAspectRatio} />}
                                        </div>
                                    </motion.div>
                                )}
                                {backgroundSubMode === 'scene' && (
                                    <motion.div
                                        key="background-scene-panel"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className="space-y-4">
                                            <div>
                                                <label htmlFor="scene-prompt" className={labelStyles}>Scene Prompt</label>
                                                <div className="relative">
                                                    <textarea id="scene-prompt" value={scenePrompt} onChange={(e) => setScenePrompt(e.target.value)} placeholder="e.g., on a marble countertop next to a plant" rows={3} className={`${inputStyles} pr-12`} />
                                                    <button onClick={handlePromptGen} disabled={isScenePromptLoading || !productImage.url || !!backgroundStatuses.scene.isLoading} title="Generate prompt from product image" className="absolute top-2 right-2 p-1 text-yellow-400 bg-black/20 rounded-lg h-8 w-8 flex items-center justify-center hover:bg-white/10 disabled:text-neutral-500 disabled:cursor-not-allowed">
                                                        {isScenePromptLoading ? <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div> : <GenIcon />}
                                                    </button>
                                                </div>
                                            </div>
                                            <AspectRatioSelector aspectRatio={aspectRatio} setAspectRatio={setAspectRatio} />
                                            <PromptEnhancerToggle isChecked={isEnhancerChecked} onChange={handleEnhancerChange} />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    </>
                )}
                {mode === 'ai-model' && (
                    <>
                        <div className={panelStyles}>
                            <label className={labelStyles}>Model Source</label>
                            <div className="flex bg-black/40 rounded-xl p-1">
                                <button onClick={() => handleSetModelSource('ai')} className={`w-1/2 rounded-lg py-2 text-base transition-colors ${modelSource === 'ai' ? 'bg-yellow-400 text-black font-bold' : 'font-medium text-neutral-300 hover:bg-white/10'}`}>AI Generated</button>
                                <button onClick={() => handleSetModelSource('custom')} className={`w-1/2 rounded-lg py-2 text-base transition-colors ${modelSource === 'custom' ? 'bg-yellow-400 text-black font-bold' : 'font-medium text-neutral-300 hover:bg-white/10'}`}>Your Model</button>
                            </div>
                        </div>
                        {modelSource === 'custom' && (
                            <UploadPlaceholder key={`model-upload-${uploadKey}`} title="Your Model" onUpload={(file) => handleFileUpload(file, 'model')} imageUrl={modelImage.url} />
                        )}
                        <UploadPlaceholder key={`product-upload-${uploadKey}`} title="Product" onUpload={(file) => handleFileUpload(file, 'product')} imageUrl={productImage.url} />
                        <div className={panelStyles}>
                            <label htmlFor="ai-prompt" className={labelStyles}>Prompt</label>
                            <div className="relative">
                                <textarea 
                                    id="ai-prompt" 
                                    value={modelSource === 'ai' ? aiGeneratedPrompt : yourModelPrompt} 
                                    onChange={(e) => modelSource === 'ai' ? setAiGeneratedPrompt(e.target.value) : setYourModelPrompt(e.target.value)} 
                                    placeholder={modelSource === 'ai' ? "e.g., a futuristic car driving on Mars" : "e.g., model driving the car on a coastal highway"} 
                                    rows={3} 
                                    className={`${inputStyles} pr-12`} 
                                />
                                <button 
                                    onClick={handlePromptGen} 
                                    disabled={isAiModelPromptLoading[modelSource] || !!aiModelStatuses[modelSource].isLoading || (modelSource === 'ai' ? !productImage.url : (!productImage.url || !modelImage.url))} 
                                    title={modelSource === 'ai' ? "Generate prompt from product image" : "Generate prompt from product and model images"} 
                                    className="absolute top-2 right-2 p-1 text-yellow-400 bg-black/20 rounded-lg h-8 w-8 flex items-center justify-center hover:bg-white/10 disabled:text-neutral-500 disabled:cursor-not-allowed"
                                >
                                    {isAiModelPromptLoading[modelSource] ? <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div> : <GenIcon />}
                                </button>
                            </div>
                        </div>
                        <div className={panelStyles}>
                            <h3 className={labelStyles}>Creative Controls</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <AspectRatioSelector aspectRatio={aspectRatio} setAspectRatio={setAspectRatio} />
                                {modelSource === 'ai' && (
                                <div>
                                    <label className={labelStyles + ' text-xs text-neutral-400 mb-1'}>Gender</label>
                                    <div className="flex bg-black/20 rounded-lg p-1">
                                        {(['Any', 'Male', 'Female'] as Gender[]).map(g => (
                                            <button key={g} onClick={() => setGender(g)} className={`w-1/3 rounded-md py-2 text-sm font-bold transition-colors ${gender === g ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>{g}</button>
                                        ))}
                                    </div>
                                </div>
                                )}
                                <div>
                                    <label htmlFor="style-select" className="text-xs text-neutral-400">Style</label>
                                    <select id="style-select" name="style" value={promptBuilder.style} onChange={handlePromptBuilderChange} className={selectStyles}>
                                        <option>Photorealistic</option>
                                        <option>Cinematic</option>
                                        <option>Product Shot</option>
                                        <option>Fashion Editorial</option>
                                        <option>Lifestyle</option>
                                        <option>Vintage Photo</option>
                                        <option>Black and White</option>
                                        <option>Dramatic</option>
                                        <option>Minimalist</option>
                                        <option>3D Render</option>
                                        <option>Fantasy Art</option>
                                        <option>Watercolor</option>
                                        <option>Anime</option>
                                        <option>Abstract</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="composition-select" className="text-xs text-neutral-400">Composition</label>
                                    <select id="composition-select" name="composition" value={promptBuilder.composition} onChange={handlePromptBuilderChange} className={selectStyles}>
                                        <option>Medium Shot</option>
                                        <option>Close-up</option>
                                        <option>Full Shot</option>
                                        <option>Portrait</option>
                                        <option>Wide Shot</option>
                                        <option>Cowboy Shot</option>
                                        <option>Low Angle</option>
                                        <option>High Angle</option>
                                        <option>Top-down</option>
                                        <option>Dutch Angle</option>
                                        <option>Over-the-shoulder</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="lighting-select" className="text-xs text-neutral-400">Lighting</label>
                                    <select id="lighting-select" name="lighting" value={promptBuilder.lighting} onChange={handlePromptBuilderChange} className={selectStyles}>
                                        <option>Studio Lighting</option>
                                        <option>Natural Light</option>
                                        <option>Soft Light</option>
                                        <option>Hard Light</option>
                                        <option>Cinematic Lighting</option>
                                        <option>Dramatic Lighting</option>
                                        <option>Golden Hour</option>
                                        <option>Backlit</option>
                                    </select>
                                </div>
                                <PromptEnhancerToggle isChecked={isEnhancerChecked} onChange={handleEnhancerChange} />
                            </div>
                        </div>
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    </div>
    );
};
    
const HistoryPanelContent = (props: any) => {
    const { 
        sessionGenerations, activeGenerationId, onSelectGeneration,
        handleDownload, handleDeleteFromHistory 
    } = props;

    return sessionGenerations.length > 0 ? (
        <div className="space-y-2 pr-2">
            <AnimatePresence>
                {sessionGenerations.map((gen, index) => {
                    const creationNumber = sessionGenerations.length - index;
                    return (
                        <motion.div
                            key={gen.id}
                            layout
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.2 } }}
                            className={`flex items-center p-2 rounded-lg transition-colors duration-200 ${activeGenerationId === gen.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                        >
                            <button 
                                onClick={() => onSelectGeneration(gen.id)}
                                disabled={gen.status !== 'done'}
                                className="w-16 h-16 rounded-md bg-neutral-800 flex-shrink-0 overflow-hidden relative group"
                            >
                                {gen.status === 'loading' && (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <svg className="animate-spin h-6 w-6 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    </div>
                                )}
                                {gen.src && (
                                    <img src={gen.src} alt={`Creation ${creationNumber}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                )}
                                {activeGenerationId === gen.id && (
                                     <div className="absolute inset-0 ring-2 ring-yellow-400 rounded-md"></div>
                                )}
                            </button>
                            <div className="flex-grow px-4">
                                <p className={`font-bold text-sm transition-colors ${activeGenerationId === gen.id ? 'text-yellow-300' : 'text-neutral-300'}`}>Creation #{creationNumber}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => handleDownload(gen.src!)} 
                                    disabled={gen.status !== 'done'}
                                    className="p-2 rounded-full text-neutral-300 hover:bg-white/10 hover:text-white disabled:text-neutral-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                    title="Download"
                                >
                                    <DownloadIcon />
                                </button>
                                <button 
                                    onClick={() => handleDeleteFromHistory(gen.id)}
                                    className="p-2 rounded-full text-neutral-300 hover:bg-red-500/20 hover:text-red-400"
                                    title="Delete"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        </motion.div>
                    )
                })}
            </AnimatePresence>
        </div>
    ) : (
        <div className="flex flex-col items-center justify-center h-full text-center text-neutral-600 p-8 space-y-4">
            <HistoryPlaceholderIcon />
            <p className="font-permanent-marker text-xl text-neutral-500">Your Creations Appear Here</p>
            <p className="text-sm max-w-xs mx-auto">
                Every image you generate in this session will be saved here for you to review and compare.
            </p>
        </div>
    )
};

const CanvasView = (props: any) => {
    const { currentStatus, canvasDisplayUrl, handleDownload, productImage, mode } = props;
    
    return (
        <div className="w-full h-full flex items-center justify-center rounded-3xl p-4 studio-canvas">
            {currentStatus.isLoading && <LoadingIndicator step={currentStatus.isLoading} />}
            {currentStatus.error && !currentStatus.isLoading && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-lg"><strong>Error:</strong> {currentStatus.error}</div>}
            
            {!currentStatus.isLoading && !currentStatus.error && (
                <>
                {canvasDisplayUrl ? (
                    <GenerationResult src={canvasDisplayUrl} alt="Generated result" onDownload={handleDownload}/>
                ) : productImage.url && (mode === 'background' || (mode === 'ai-model' && productImage.url)) ? (
                    <img src={productImage.url} alt="Product preview" className="max-w-full max-h-full object-contain rounded-xl" />
                ) : (
                    <div className="text-center text-neutral-400">
                        <h2 className="text-xl font-permanent-marker tracking-widest" style={{ color: '#9e9e9e' }}>
                            UPLOAD A PRODUCT TO BEGIN
                        </h2>
                        <p className="text-sm mt-1" style={{ color: '#757575' }}>
                            Your creative studio awaits.
                        </p>
                    </div>
                )}
                </>
            )}
            <div className="studio-canvas-handle"></div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
export default function App() {
    // --- STATE MANAGEMENT ---
    const [mode, setMode] = useState<Mode>('background');
    const [backgroundSubMode, setBackgroundSubMode] = useState<BackgroundSubMode>('color');
    const [uploadKey, setUploadKey] = useState(0);
    const [activeTab, setActiveTab] = useState<AppTab>('settings');
    const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);
    const [newHistoryNotification, setNewHistoryNotification] = useState(false);

    // Image assets
    const [productImage, setProductImage] = useState<ImageState>(initialProductImage);
    const [modelImage, setModelImage] = useState<ImageState>(initialModelImage);

    // Generation histories (undo/redo) for each feature
    const [generationStacks, setGenerationStacks] = useState<GenerationStacks>(initialGenerationStacks);

    // Visual log of all generations for the history panel
    const [sessionGenerations, setSessionGenerations] = useState<SessionGeneration[]>([]);
    const [activeGenerationId, setActiveGenerationId] = useState<number | null>(null);
    const generationIdCounter = useRef(0);
    
    // Statuses for API operations
    const [backgroundStatuses, setBackgroundStatuses] = useState<BackgroundStatuses>(initialBackgroundStatuses);
    const [aiModelStatuses, setAiModelStatuses] = useState<AiModelStatuses>(initialAiModelStatuses);
    const [isScenePromptLoading, setIsScenePromptLoading] = useState(false);
    const [isAiModelPromptLoading, setIsAiModelPromptLoading] = useState<AiModelPromptLoading>(initialAiModelPromptLoading);
    
    // Generation Settings
    const [backgroundColor, setBackgroundColor] = useState('#f0f0f0');
    const [scenePrompt, setScenePrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [promptEnhancer, setPromptEnhancer] = useState(true);
    
    // AI Model Mode State
    const [modelSource, setModelSource] = useState<ModelSource>('ai');
    const [aiGeneratedPrompt, setAiGeneratedPrompt] = useState('');
    const [yourModelPrompt, setYourModelPrompt] = useState('');
    const [gender, setGender] = useState<Gender>('Any');
    const [promptBuilder, setPromptBuilder] = useState<PromptBuilderSettings>(initialPromptBuilder);
    const [aiGeneratedPromptEnhancer, setAiGeneratedPromptEnhancer] = useState(true);
    const [yourModelPromptEnhancer, setYourModelPromptEnhancer] = useState(true);

    const handlePromptBuilderChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setPromptBuilder(prev => ({ ...prev, [name]: value }));
    };

    const colorSwatches = useMemo(() => [
        '#ffffff', '#f1f5f9', '#94a3b8', '#475569', '#1e293b', '#000000',
        '#fecaca', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8',
        '#dc2626', '#f97316', '#16a34a', '#2563eb', '#7c3aed', '#db2777',
        '#eaddc7', '#0a2342', '#556b2f', '#ffdb58', '#800020'
    ], []);

    const getCurrentFeatureKey = useMemo((): keyof GenerationStacks => {
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && backgroundColor === 'transparent';
            const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
            return `background-${effectiveSubMode}`;
        }
        return `ai-model-${modelSource}`;
    }, [mode, backgroundSubMode, backgroundColor, modelSource]);

    // Use a ref to track the current feature key to avoid stale closures in async callbacks.
    const currentFeatureKeyRef = useRef(getCurrentFeatureKey);
    useEffect(() => {
        currentFeatureKeyRef.current = getCurrentFeatureKey;
    }, [getCurrentFeatureKey]);

    useEffect(() => {
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && backgroundColor === 'transparent';
            const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
            setBackgroundStatuses(s => ({ ...s, [effectiveSubMode]: { ...s[effectiveSubMode], error: null }}));
        }
        if (mode === 'ai-model') {
            setAiModelStatuses(s => ({ ...s, [modelSource]: { ...s[modelSource], error: null }}));
        }
    }, [mode, backgroundSubMode, modelSource, backgroundColor]);

    // This effect ensures the canvas view is synchronized with the settings panel.
    // If the user views a generation from history belonging to a different feature,
    // and then returns to the settings tab, the canvas will reset to show the
    // state of the currently active feature.
    useEffect(() => {
        if (activeTab === 'settings' && activeGenerationId !== null) {
            const activeGen = sessionGenerations.find(g => g.id === activeGenerationId);
            // If the active generation's feature doesn't match the current feature key, deselect it.
            if (activeGen && activeGen.featureKey !== getCurrentFeatureKey) {
                setActiveGenerationId(null);
            }
        }
    }, [activeTab, activeGenerationId, sessionGenerations, getCurrentFeatureKey]);


    // --- HISTORY MANAGEMENT ---
    const recordNewGeneration = (
        imageUrl: string,
        generationId: number,
        featureKey: keyof GenerationStacks
    ) => {
        // Update session generation log (the visual history panel)
        setSessionGenerations(prev => prev.map(gen => 
            gen.id === generationId ? { ...gen, src: imageUrl, status: 'done' } : gen
        ));
        
        // Only set as active (and update canvas) if the completed generation
        // matches the feature the user is currently looking at.
        const generationMatchesCurrentMode = featureKey === currentFeatureKeyRef.current;
        if (generationMatchesCurrentMode) {
            setActiveGenerationId(generationId);
        }
        
        const isMobile = window.innerWidth < 1024;
        if ((isMobile && !isMobileHistoryOpen) || (!isMobile && activeTab !== 'history')) {
            setNewHistoryNotification(true);
        }

        // Update the specific feature's undo/redo history stack
        setGenerationStacks(prevStacks => {
            const currentStack = prevStacks[featureKey];
            // If we are in the middle of the stack, a new generation truncates the "redo" part
            const newImages = [...currentStack.images.slice(0, currentStack.currentIndex + 1), imageUrl];
            return {
                ...prevStacks,
                [featureKey]: {
                    images: newImages,
                    currentIndex: newImages.length - 1,
                }
            };
        });
    };

    const handleUndo = () => {
        const featureKey = getCurrentFeatureKey;
        setGenerationStacks(prev => {
            const stack = prev[featureKey];
            if (stack.currentIndex >= 0) {
                return {
                    ...prev,
                    [featureKey]: { ...stack, currentIndex: stack.currentIndex - 1 }
                };
            }
            return prev;
        });
        setActiveGenerationId(null); // Always clear selection on undo/redo
    };
    
    const handleRedo = () => {
        const featureKey = getCurrentFeatureKey;
        setGenerationStacks(prev => {
            const stack = prev[featureKey];
            if (stack.currentIndex < stack.images.length - 1) {
                return {
                    ...prev,
                    [featureKey]: { ...stack, currentIndex: stack.currentIndex + 1 }
                };
            }
            return prev;
        });
        setActiveGenerationId(null); // Always clear selection on undo/redo
    };

    const handleStartOver = () => {
        setMode('background');
        setBackgroundSubMode('color');
        setActiveTab('settings');
        setIsMobileHistoryOpen(false);
        setProductImage(initialProductImage);
        setModelImage(initialModelImage);
        setGenerationStacks(initialGenerationStacks);
        
        setBackgroundStatuses(initialBackgroundStatuses);
        setAiModelStatuses(initialAiModelStatuses);
        setIsScenePromptLoading(false);
        setIsAiModelPromptLoading(initialAiModelPromptLoading);

        setBackgroundColor('#f0f0f0');
        setScenePrompt('');
        setAspectRatio('1:1');
        setPromptEnhancer(true);
        setAiGeneratedPromptEnhancer(true);
        setYourModelPromptEnhancer(true);
        setAiGeneratedPrompt('');
        setYourModelPrompt('');
        setGender('Any');
        setModelSource('ai');
        setPromptBuilder(initialPromptBuilder);
        setUploadKey(k => k + 1);
        
        setSessionGenerations([]);
        setActiveGenerationId(null);
        setNewHistoryNotification(false);
    };
    
    const currentStack = generationStacks[getCurrentFeatureKey];
    const canUndo = currentStack && currentStack.currentIndex >= 0;
    const canRedo = currentStack && currentStack.currentIndex < currentStack.images.length - 1;

    // --- CONTEXT-AWARE DISPLAY HANDLERS ---
    const handleSetMode = (newMode: Mode) => {
        if (mode !== newMode) {
            setMode(newMode);
            setActiveGenerationId(null);
        }
    };

    const handleSetBackgroundSubMode = (newSubMode: BackgroundSubMode) => {
        if (backgroundSubMode !== newSubMode) {
            setBackgroundSubMode(newSubMode);
            setActiveGenerationId(null);
        }
    };

    const handleSetModelSource = (newSource: ModelSource) => {
        if (modelSource !== newSource) {
            setModelSource(newSource);
            setActiveGenerationId(null);
        }
    };

    // --- EVENT HANDLERS ---
    const handleDownload = (src: string) => {
        const blob = dataURLtoBlob(src);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const extension = getFileExtensionFromDataUrl(src);
        link.download = `blendify-ai-${Date.now()}.${extension}`;
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDeleteFromHistory = (idToDelete: number) => {
        setSessionGenerations(prev => prev.filter(gen => gen.id !== idToDelete));
        if (activeGenerationId === idToDelete) {
            setActiveGenerationId(null);
        }
    };
    
    const handleFileUpload = (file: File, imageType: 'product' | 'model') => {
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const url = event.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    if (mode === 'background') {
                        const isTransparent = backgroundSubMode === 'color' && backgroundColor === 'transparent';
                        const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
                        setBackgroundStatuses(s => ({ ...s, [effectiveSubMode]: { ...s[effectiveSubMode], error: null } }));
                    }
                    if (mode === 'ai-model') {
                        setAiModelStatuses(s => ({ ...s, [modelSource]: { ...s[modelSource], error: null } }));
                    }

                    const imageData = { url, file, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight };
                    if (imageType === 'product') {
                        setProductImage(imageData);
                        // New product upload is a major change, reset all generation histories
                        setSessionGenerations([]);
                        setActiveGenerationId(null);
                        setGenerationStacks(initialGenerationStacks);
                    } else { // model
                        setModelImage(imageData);
                    }
                };
                img.src = url;
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePromptGen = async () => {
        const invokedMode = mode;
        const invokedModelSource = modelSource;

        try {
            if (invokedMode === 'background') {
                if (!productImage.url || isScenePromptLoading) return;
                setIsScenePromptLoading(true);
                setBackgroundStatuses(prev => ({...prev, scene: { ...prev.scene, error: null }}));
                const { preparedDataUrl } = await prepareImage(productImage.url);
                const suggestion = await generatePromptSuggestion(preparedDataUrl, 'background');
                setScenePrompt(suggestion);
            } else if (invokedMode === 'ai-model') {
                if (isAiModelPromptLoading[invokedModelSource]) return;
                if (invokedModelSource === 'ai' && !productImage.url) return;
                if (invokedModelSource === 'custom' && (!productImage.url || !modelImage.url)) return;
                
                setIsAiModelPromptLoading(prev => ({...prev, [invokedModelSource]: true}));
                setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { ...prev[invokedModelSource], error: null }}));

                const { preparedDataUrl: preparedProductUrl } = await prepareImage(productImage.url!);
                let preparedModelUrl: string | undefined = undefined;
                if (invokedModelSource === 'custom' && modelImage.url) {
                    const { preparedDataUrl } = await prepareImage(modelImage.url);
                    preparedModelUrl = preparedDataUrl;
                }
                const suggestion = await generatePromptSuggestion(preparedProductUrl, 'ai-model', preparedModelUrl);
                
                if (invokedModelSource === 'ai') {
                    setAiGeneratedPrompt(suggestion);
                } else {
                    setYourModelPrompt(suggestion);
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to generate prompt.';
            if (invokedMode === 'background') {
                setBackgroundStatuses(prev => ({...prev, scene: { isLoading: '', error: errorMsg }}));
            }
            if (invokedMode === 'ai-model') {
                setAiModelStatuses(prev => ({...prev, [invokedModelSource]: { isLoading: '', error: errorMsg }}));
            }
        } finally {
            if (invokedMode === 'background') {
                setIsScenePromptLoading(false);
            }
            if (invokedMode === 'ai-model') {
                setIsAiModelPromptLoading(prev => ({...prev, [invokedModelSource]: false}));
            }
        }
    };
    
    const handleBackgroundGenerate = async () => {
        if (!productImage.url) return;

        const isTransparentRequest = backgroundSubMode === 'color' && backgroundColor === 'transparent';
        const effectiveSubMode: ServiceBackgroundSubMode = isTransparentRequest ? 'transparent' : backgroundSubMode;
        const featureKey: keyof GenerationStacks = `background-${effectiveSubMode}`;

        if (backgroundStatuses[effectiveSubMode].isLoading) return;

        const snapshot: GenerationStateSnapshot = {
            mode, backgroundSubMode, modelSource, backgroundColor, scenePrompt,
            aspectRatio, promptEnhancer, aiGeneratedPrompt, yourModelPrompt, gender,
            promptBuilder, aiGeneratedPromptEnhancer, yourModelPromptEnhancer,
            productImageUrl: productImage.url, modelImageUrl: modelImage.url,
        };

        const newId = generationIdCounter.current++;
        setSessionGenerations(prev => [{ id: newId, src: null, status: 'loading', featureKey, snapshot }, ...prev]);
        setActiveGenerationId(newId);

        setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { isLoading: 'Generating...', error: null }}));

        const subModeSettings = 
            effectiveSubMode === 'color' ? { backgroundColor, aspectRatio } :
            effectiveSubMode === 'scene' ? { scenePrompt, aspectRatio } :
            {};

        const settings = { 
            promptOptimizer: promptEnhancer, 
            backgroundSubMode: effectiveSubMode,
            ...subModeSettings,
        };

        try {
            const prepareAspectRatio = effectiveSubMode === 'transparent' ? '1:1' : aspectRatio;
            const { preparedDataUrl } = await prepareImage(productImage.url, 1024, prepareAspectRatio);
            
            const result = await generateProductShot(preparedDataUrl, settings);
            
            let finalImage = result;
            if (effectiveSubMode === 'transparent') {
                finalImage = await cropImage(result, productImage.originalWidth, productImage.originalHeight);
            }

            recordNewGeneration(finalImage, newId, featureKey);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred.';
            setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { isLoading: '', error: errorMsg }}));
            setSessionGenerations(prev => prev.filter(gen => gen.id !== newId));
        } finally {
            setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { ...prev[effectiveSubMode], isLoading: '' }}));
        }
    };
    
    const handleAiModelGenerate = async () => {
        const invokedModelSource = modelSource;
        const featureKey: keyof GenerationStacks = `ai-model-${invokedModelSource}`;

        if (aiModelStatuses[invokedModelSource].isLoading) return;

        const snapshot: GenerationStateSnapshot = {
            mode, backgroundSubMode, modelSource, backgroundColor, scenePrompt,
            aspectRatio, promptEnhancer, aiGeneratedPrompt, yourModelPrompt, gender,
            promptBuilder, aiGeneratedPromptEnhancer, yourModelPromptEnhancer,
            productImageUrl: productImage.url, modelImageUrl: modelImage.url,
        };

        const newId = generationIdCounter.current++;
        setSessionGenerations(prev => [{ id: newId, src: null, status: 'loading', featureKey, snapshot }, ...prev]);
        setActiveGenerationId(newId);

        const currentPrompt = invokedModelSource === 'ai' ? aiGeneratedPrompt : yourModelPrompt;
        const currentEnhancer = invokedModelSource === 'ai' ? aiGeneratedPromptEnhancer : yourModelPromptEnhancer;

        setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { isLoading: 'Generating...', error: null }}));

        try {
            let productUrlForApi: string | null = productImage.url;
            let modelUrlForApi: string | null = null;

            if (productUrlForApi) {
                const { preparedDataUrl } = await prepareImage(productUrlForApi, 1024, aspectRatio);
                productUrlForApi = preparedDataUrl;
            }

            if (invokedModelSource === 'custom' && modelImage.url) {
                setAiModelStatuses(prev => ({...prev, [invokedModelSource]: { ...prev[invokedModelSource], isLoading: 'Blending concepts...'}}));
                const { preparedDataUrl } = await prepareImage(modelImage.url, 1024, aspectRatio);
                modelUrlForApi = preparedDataUrl;
            }
            
            const result = await generateAiModelShot(currentPrompt, promptBuilder, productUrlForApi, gender, currentEnhancer, modelUrlForApi);
            
            recordNewGeneration(result, newId, featureKey);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred.';
            setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { isLoading: '', error: errorMsg }}));
            setSessionGenerations(prev => prev.filter(gen => gen.id !== newId));
        } finally {
            setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { ...prev[invokedModelSource], isLoading: '' }}));
        }
    };

    const handleGenerateClick = () => {
        if (mode === 'background') {
            handleBackgroundGenerate();
        } else if (mode === 'ai-model') {
            handleAiModelGenerate();
        }
    };
    
    const currentStatus = useMemo(() => {
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && backgroundColor === 'transparent';
            const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
            return backgroundStatuses[effectiveSubMode];
        }
        if (mode === 'ai-model') return aiModelStatuses[modelSource];
        return initialOpStatus;
    }, [mode, backgroundSubMode, modelSource, backgroundColor, backgroundStatuses, aiModelStatuses]);
    
    const canGenerate = useMemo(() => {
        if (currentStatus.isLoading) return false;
        if (mode === 'background' && productImage.url) return true;
        if (mode === 'ai-model') {
            if (modelSource === 'ai') return !!(productImage.url && aiGeneratedPrompt);
            if (modelSource === 'custom') return !!(productImage.url && modelImage.url && yourModelPrompt);
        }
        return false;
    }, [currentStatus.isLoading, productImage.url, modelImage.url, mode, aiGeneratedPrompt, yourModelPrompt, backgroundSubMode, modelSource]);

    // Determine which image to show on the main canvas
    const canvasDisplayUrl = useMemo(() => {
        // If an image from the history panel is explicitly selected, show it.
        if (activeGenerationId !== null) {
            return sessionGenerations.find(g => g.id === activeGenerationId)?.src ?? null;
        }

        // Otherwise, show the image from the current feature's undo/redo stack.
        const stack = generationStacks[getCurrentFeatureKey];
        if (stack && stack.currentIndex >= 0) {
            return stack.images[stack.currentIndex];
        }
        
        // If stack is empty or at the beginning, show nothing (which will default to product image).
        return null;
    }, [activeGenerationId, sessionGenerations, getCurrentFeatureKey, generationStacks]);

    const isEnhancerChecked = mode === 'ai-model' ? (modelSource === 'ai' ? aiGeneratedPromptEnhancer : yourModelPromptEnhancer) : promptEnhancer;
    const handleEnhancerChange = () => {
        if (mode === 'ai-model') {
            if (modelSource === 'ai') {
                setAiGeneratedPromptEnhancer(!aiGeneratedPromptEnhancer);
            } else {
                setYourModelPromptEnhancer(!yourModelPromptEnhancer);
            }
        } else {
            setPromptEnhancer(!promptEnhancer);
        }
    };

    const handleSelectGeneration = (id: number) => {
        const generation = sessionGenerations.find(gen => gen.id === id);
        if (!generation || !generation.snapshot) return;

        const { snapshot } = generation;

        // Restore all state from the snapshot
        setMode(snapshot.mode);
        setBackgroundSubMode(snapshot.backgroundSubMode);
        setModelSource(snapshot.modelSource);
        setBackgroundColor(snapshot.backgroundColor);
        setScenePrompt(snapshot.scenePrompt);
        setAspectRatio(snapshot.aspectRatio);
        setPromptEnhancer(snapshot.promptEnhancer);
        setAiGeneratedPrompt(snapshot.aiGeneratedPrompt);
        setYourModelPrompt(snapshot.yourModelPrompt);
        setGender(snapshot.gender);
        setPromptBuilder(snapshot.promptBuilder);
        setAiGeneratedPromptEnhancer(snapshot.aiGeneratedPromptEnhancer);
        setYourModelPromptEnhancer(snapshot.yourModelPromptEnhancer);

        // Restore image states as well
        if (snapshot.productImageUrl) {
            // NOTE: The File object is lost, but we can restore the URL for display
            // and for re-generation. We need to load it to get original dimensions.
            const productImg = new Image();
            productImg.onload = () => {
                setProductImage({
                    url: snapshot.productImageUrl!,
                    file: null, 
                    originalWidth: productImg.naturalWidth,
                    originalHeight: productImg.naturalHeight,
                });
            };
            productImg.src = snapshot.productImageUrl;
        } else {
            setProductImage(initialProductImage);
        }

        if (snapshot.modelImageUrl) {
            const modelImg = new Image();
            modelImg.onload = () => {
                setModelImage({
                    url: snapshot.modelImageUrl!,
                    file: null,
                    originalWidth: modelImg.naturalWidth,
                    originalHeight: modelImg.naturalHeight,
                });
            };
            modelImg.src = snapshot.modelImageUrl;
        } else {
            setModelImage(initialModelImage);
        }


        // Switch to settings tab to show the restored settings
        setActiveTab('settings');

        // Select the generation to display it on the canvas
        setActiveGenerationId(id);

        const isMobile = window.innerWidth < 1024;
        if (isMobile) {
            setIsMobileHistoryOpen(false);
        }
    };

    const settingsPanelProps = {
        mode, handleSetMode, backgroundSubMode, handleSetBackgroundSubMode,
        uploadKey, handleFileUpload, productImage, modelImage, colorSwatches,
        backgroundColor, setBackgroundColor, aspectRatio, setAspectRatio,
        scenePrompt, setScenePrompt, handlePromptGen, isScenePromptLoading,
        backgroundStatuses, promptEnhancer, isEnhancerChecked, handleEnhancerChange,
        modelSource, handleSetModelSource, aiGeneratedPrompt, setAiGeneratedPrompt,
        yourModelPrompt, setYourModelPrompt, isAiModelPromptLoading, aiModelStatuses,
        gender, setGender, promptBuilder, handlePromptBuilderChange,
    };

    const historyPanelProps = {
        sessionGenerations,
        activeGenerationId,
        onSelectGeneration: handleSelectGeneration,
        handleDownload,
        handleDeleteFromHistory
    };
    
    const canvasViewProps = {
        currentStatus, canvasDisplayUrl, handleDownload, productImage, mode
    };
    
    return (
        <div className="bg-neutral-900 text-white h-screen flex flex-col font-roboto overflow-hidden">
            {/* --- DESKTOP LAYOUT --- */}
            <div className="hidden lg:flex flex-col h-full">
                <header className="flex-shrink-0 bg-black/20 border-b border-white/10 h-16 flex items-center justify-between px-4">
                    <h1 className="text-2xl font-permanent-marker text-neutral-300">Dashboard</h1>
                    <div className="flex items-center gap-2 bg-black/20 rounded-lg p-1">
                        <button onClick={() => setActiveTab('settings')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'settings' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>Settings</button>
                        <button onClick={() => { setActiveTab('history'); setNewHistoryNotification(false); }} className={`relative px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === 'history' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>
                            History
                            {newHistoryNotification && (
                                <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-neutral-800"></span>
                            )}
                        </button>
                    </div>
                    <HistoryControls 
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onStartOver={handleStartOver}
                    />
                </header>
                
                <div className="flex-1 flex flex-row overflow-hidden">
                    <main className="flex-1 flex flex-col items-center justify-center studio-background p-8 relative">
                         <div className="w-full h-full">
                            <CanvasView {...canvasViewProps} />
                        </div>
                    </main>
                    <aside className="w-96 flex-shrink-0 bg-black/20 flex flex-col">
                        <div className="flex-grow overflow-y-auto p-4">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {activeTab === 'settings' && <SettingsPanelContent {...settingsPanelProps}/>}
                                    {activeTab === 'history' && <HistoryPanelContent {...historyPanelProps} />}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                        
                        {activeTab === 'settings' && (
                            <div className="p-4 flex-shrink-0 bg-gradient-to-t from-neutral-900">
                                <button onClick={handleGenerateClick} disabled={!canGenerate} className={primaryButtonClasses + ' w-full'}>
                                    {currentStatus.isLoading ? 'Generating...' : 'Generate'}
                                </button>
                            </div>
                        )}
                    </aside>
                </div>
            </div>

            {/* --- MOBILE / TABLET LAYOUT --- */}
            <div className="lg:hidden flex flex-col h-full bg-neutral-900">
                <header className="flex-shrink-0 bg-black/20 backdrop-blur-sm border-b border-white/10 h-16 flex items-center justify-between px-4 z-30">
                    <h1 className="text-xl font-permanent-marker text-neutral-300">Dashboard</h1>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setIsMobileHistoryOpen(true);
                                setNewHistoryNotification(false);
                            }}
                            className="relative p-2 rounded-lg hover:bg-white/20"
                            title="View History"
                        >
                            <HistoryIcon className="w-6 h-6" />
                            {newHistoryNotification && (
                                <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-yellow-400 ring-2 ring-neutral-800"></span>
                            )}
                        </button>
                        <HistoryControls 
                            canUndo={canUndo}
                            canRedo={canRedo}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            onStartOver={handleStartOver}
                        />
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
                    <div className="w-full aspect-square studio-background rounded-3xl">
                        <CanvasView {...canvasViewProps} />
                    </div>
                    <SettingsPanelContent {...settingsPanelProps} />
                </main>

                <div className="p-4 flex-shrink-0 bg-gradient-to-t from-neutral-900 fixed bottom-0 left-0 right-0 z-20">
                    <button onClick={handleGenerateClick} disabled={!canGenerate} className={primaryButtonClasses + ' w-full'}>
                        {currentStatus.isLoading ? 'Generating...' : 'Generate'}
                    </button>
                </div>

                <AnimatePresence>
                    {isMobileHistoryOpen && (
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.3 }}
                            className="fixed inset-0 bg-neutral-900 z-50 flex flex-col"
                        >
                            <header className="flex-shrink-0 bg-black/20 border-b border-white/10 h-16 flex items-center justify-between px-4">
                                <h2 className="text-xl font-permanent-marker text-neutral-300">History</h2>
                                <button onClick={() => setIsMobileHistoryOpen(false)} className="p-2 rounded-lg hover:bg-white/20">
                                    <CloseIcon className="w-6 h-6" />
                                </button>
                            </header>
                            <div className="flex-1 overflow-y-auto p-4">
                                <HistoryPanelContent {...historyPanelProps} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}