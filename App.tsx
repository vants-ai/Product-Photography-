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
// FIX: Define a more specific type for the sub-mode passed to the service
// to prevent type widening to `string`. This must match the type in geminiService.
type ServiceBackgroundSubMode = 'color' | 'scene' | 'transparent';
type Gender = 'Any' | 'Male' | 'Female';
type ModelSource = 'ai' | 'custom';
type LoadingStep = '' | 'Generating...' | 'Blending concepts...';
interface ImageState {
  url: string | null;
  file: File | null;
  originalWidth: number;
  originalHeight: number;
}
interface AiModelImages {
    ai: string | null;
    custom: string | null;
}
interface BackgroundGeneratedImages {
    color: string | null;
    scene: string | null;
    transparent: string | null;
}
interface GeneratedImagesState {
    background: BackgroundGeneratedImages;
    'ai-model': AiModelImages;
}
interface PromptBuilderSettings {
    style: string;
    composition: string;
    lighting: string;
}
interface HistoryState {
    generatedImages: GeneratedImagesState;
    productImage: ImageState;
    modelImage: ImageState;
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


// --- UI CONSTANTS ---
const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-gradient-to-b from-yellow-400 to-yellow-500 py-3 px-8 rounded-md transform transition-all duration-200 hover:scale-105 hover:-rotate-1 hover:from-yellow-300 hover:to-yellow-400 shadow-[3px_3px_0px_black] hover:shadow-[4px_4px_0px_black] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:bg-yellow-400 disabled:shadow-[3px_3px_0px_black] disabled:from-yellow-400 disabled:to-yellow-500";
const panelStyles = "bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4 space-y-4";
const labelStyles = "block font-permanent-marker text-neutral-300 text-sm tracking-wider mb-2";
const inputStyles = "w-full bg-black/40 border border-white/20 rounded-md p-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-yellow-400";
const selectStyles = `${inputStyles} cursor-pointer`;


// --- ICON COMPONENTS ---
const UploadIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>);
const BackgroundIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>);
const AiModelIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>);
const InfoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const GenIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" {...props}><path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 001.84 1.84l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-1.84 1.84l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-1.84-1.84l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 001.84-1.84l.813-2.846A.75.75 0 019 4.5zM15.991 15.06a.75.75 0 01.581.422l.494 1.727a2.25 2.25 0 001.105 1.105l1.727.494a.75.75 0 010 1.342l-1.727.494a2.25 2.25 0 00-1.105 1.105l-.494 1.727a.75.75 0 01-1.342 0l-.494-1.727a2.25 2.25 0 00-1.105-1.105l-1.727-.494a.75.75 0 010-1.342l1.727-.494a2.25 2.25 0 001.105-1.105l.494-1.727a.75.75 0 01.76-.422z" clipRule="evenodd" /></svg>);
const UndoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>);
const RedoIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>);
const StartOverIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>);
const ChevronIcon = (props: React.SVGProps<SVGSVGElement>) => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>);

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
        // By resetting the input's value, we ensure the onChange event will
        // fire even if the user selects the same file again. This fixes the
        // bug where re-uploading the same file after a reset doesn't work.
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
        <div className={panelStyles + " p-0"}>
            <label 
                className={`cursor-pointer relative flex flex-col items-center justify-center p-6 h-32 border-2 border-dashed rounded-lg hover:bg-white/10 transition-all overflow-hidden group ${isDraggingOver ? 'border-yellow-400 bg-yellow-900/20' : 'border-white/20'}`}
                onDragOver={(e) => handleDragEvents(e, true)}
                onDragEnter={(e) => handleDragEvents(e, true)}
                onDragLeave={(e) => handleDragEvents(e, false)}
                onDrop={handleDrop}
            >
                {imageUrl && (
                    <img src={imageUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover blur-sm opacity-20 group-hover:opacity-30 transition-opacity" />
                )}
                <div className="relative z-10 flex flex-col items-center text-center pointer-events-none">
                    <UploadIcon />
                    <span className="mt-2 font-permanent-marker text-neutral-200 drop-shadow-md">{imageUrl ? `Change ${title}` : `Upload ${title}`}</span>
                    <span className="text-xs text-neutral-400">or drag and drop</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>
        </div>
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

const GenerationResult = ({ src, alt }: { src: string; alt: string; }) => {
    const handleDownload = () => {
        // Convert data URL to Blob for a more robust download
        const blob = dataURLtoBlob(src);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const extension = getFileExtensionFromDataUrl(src);
        link.download = `blendify-ai-${Date.now()}.${extension}`;
        
        document.body.appendChild(link);
        link.click();
        
        // Clean up by revoking the object URL and removing the link
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 relative group">
            <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-md" />
            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={handleDownload} 
                    className="bg-yellow-400 text-black font-bold py-2 px-4 rounded-md shadow-lg hover:bg-yellow-300 transition-colors flex items-center gap-2"
                    aria-label="Download Image"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    Download
                </button>
            </div>
        </div>
    );
};

const HistoryControls = ({ canUndo, canRedo, onUndo, onRedo, onStartOver }: { canUndo: boolean, canRedo: boolean, onUndo: () => void, onRedo: () => void, onStartOver: () => void }) => {
    return (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-sm p-1 rounded-md">
            <button onClick={onUndo} disabled={!canUndo} className="p-2 rounded-md hover:bg-white/20 disabled:text-neutral-500 disabled:hover:bg-transparent disabled:cursor-not-allowed" title="Undo">
                <UndoIcon />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-2 rounded-md hover:bg-white/20 disabled:text-neutral-500 disabled:hover:bg-transparent disabled:cursor-not-allowed" title="Redo">
                <RedoIcon />
            </button>
             <div className="w-px h-5 bg-white/20 mx-1"></div>
            <button onClick={onStartOver} className="p-2 rounded-md text-red-400 hover:bg-red-900/50" title="Start Over">
                <StartOverIcon />
            </button>
        </div>
    );
};


// --- INITIAL STATES ---
const initialGeneratedImages: GeneratedImagesState = {
    background: { color: null, scene: null, transparent: null },
    'ai-model': { ai: null, custom: null },
};
const initialProductImage: ImageState = { url: null, file: null, originalWidth: 0, originalHeight: 0 };
const initialModelImage: ImageState = { url: null, file: null, originalWidth: 0, originalHeight: 0 };

const initialPromptBuilder: PromptBuilderSettings = {
    style: 'Photorealistic',
    composition: 'Medium Shot',
    lighting: 'Natural Light',
};
const initialHistoryState: HistoryState = {
    generatedImages: initialGeneratedImages,
    productImage: initialProductImage,
    modelImage: initialModelImage,
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


// --- MAIN APP COMPONENT ---
export default function App() {
    // --- STATE MANAGEMENT ---
    const [mode, setMode] = useState<Mode>('background');
    const [backgroundSubMode, setBackgroundSubMode] = useState<BackgroundSubMode>('color');
    const [uploadKey, setUploadKey] = useState(0);

    // REFACTORED: Combine history and index into a single state object
    // to ensure atomic updates and prevent race conditions from concurrent generations.
    const [historyData, setHistoryData] = useState({
        history: [initialHistoryState] as HistoryState[],
        index: 0,
    });
    const { history, index: historyIndex } = historyData;
    const { productImage, modelImage, generatedImages } = history[historyIndex];

    // DECOUPLED STATE: Each feature has its own status for non-blocking concurrent operations
    const [backgroundStatuses, setBackgroundStatuses] = useState<BackgroundStatuses>(initialBackgroundStatuses);
    const [aiModelStatuses, setAiModelStatuses] = useState<AiModelStatuses>(initialAiModelStatuses);
    const [isScenePromptLoading, setIsScenePromptLoading] = useState(false);
    const [isAiModelPromptLoading, setIsAiModelPromptLoading] = useState<AiModelPromptLoading>(initialAiModelPromptLoading);
    
    // Generation Settings
    const [backgroundColor, setBackgroundColor] = useState('#f0f0f0'); // Can also be 'transparent'
    const [scenePrompt, setScenePrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [promptEnhancer, setPromptEnhancer] = useState(true);
    
    // AI Model Mode State - Separated workflows
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
        // Row 1: Neutrals 
        '#ffffff', '#f1f5f9', '#94a3b8', '#475569', '#1e293b', '#000000',
        // Row 2: Soft Pastels
        '#fecaca', '#fed7aa', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8',
        // Row 3: Rich/Vibrant Tones
        '#dc2626', '#f97316', '#16a34a', '#2563eb', '#7c3aed', '#db2777'
    ], []);
    
    
    useEffect(() => {
        // When switching modes or sub-modes, clear the error of the newly visible feature.
        // Do not clear loading state, allowing operations to continue in the background.
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && backgroundColor === 'transparent';
            const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
            setBackgroundStatuses(s => ({ ...s, [effectiveSubMode]: { ...s[effectiveSubMode], error: null }}));
        }
        if (mode === 'ai-model') {
            setAiModelStatuses(s => ({ ...s, [modelSource]: { ...s[modelSource], error: null }}));
        }
    }, [mode, backgroundSubMode, modelSource, backgroundColor]);

    // --- HISTORY MANAGEMENT ---
    const pushHistoryState = (
        imageType: 'background' | 'ai-model',
        imageSource: ModelSource | ServiceBackgroundSubMode | null,
        imageUrl: string
    ) => {
        setHistoryData(prev => {
            const currentState = prev.history[prev.index];
            
            let newGeneratedImages: GeneratedImagesState;
            if (imageType === 'background') {
                newGeneratedImages = {
                    ...currentState.generatedImages,
                    background: {
                        ...currentState.generatedImages.background,
                        [imageSource as ServiceBackgroundSubMode]: imageUrl,
                    }
                };
            } else { // ai-model
                newGeneratedImages = {
                    ...currentState.generatedImages,
                    'ai-model': {
                        ...currentState.generatedImages['ai-model'],
                        [imageSource as ModelSource]: imageUrl,
                    }
                };
            }

            const newEntry: HistoryState = {
                ...currentState,
                generatedImages: newGeneratedImages,
            };

            const newHistory = [...prev.history.slice(0, prev.index + 1), newEntry];
            return {
                history: newHistory,
                index: newHistory.length - 1,
            };
        });
    };

    const handleUndo = () => {
        setHistoryData(prev => ({
            ...prev,
            index: prev.index > 0 ? prev.index - 1 : 0
        }));
    };
    
    const handleRedo = () => {
        setHistoryData(prev => ({
            ...prev,
            index: prev.index < prev.history.length - 1 ? prev.index + 1 : prev.index
        }));
    };

    const handleStartOver = () => {
        const freshHistoryState: HistoryState = {
            generatedImages: initialGeneratedImages,
            productImage: initialProductImage,
            modelImage: initialModelImage,
        };
        const freshPromptBuilder: PromptBuilderSettings = {
            style: 'Photorealistic',
            composition: 'Medium Shot',
            lighting: 'Natural Light',
        };

        setMode('background');
        setBackgroundSubMode('color');
        setHistoryData({
            history: [freshHistoryState],
            index: 0,
        });
        
        // Reset all mode-specific statuses
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
        setPromptBuilder(freshPromptBuilder);
        setUploadKey(k => k + 1);
    };
    
    const canUndo = historyData.index > 0;
    const canRedo = historyData.index < historyData.history.length - 1;


    // --- EVENT HANDLERS ---
    const handleFileUpload = (file: File, imageType: 'product' | 'model') => {
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const url = event.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    // Clear relevant errors on new upload for the active feature
                    if (mode === 'background') {
                        const isTransparent = backgroundSubMode === 'color' && backgroundColor === 'transparent';
                        const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
                        setBackgroundStatuses(s => ({ ...s, [effectiveSubMode]: { ...s[effectiveSubMode], error: null } }));
                    }
                    if (mode === 'ai-model') {
                        setAiModelStatuses(s => ({ ...s, [modelSource]: { ...s[modelSource], error: null } }));
                    }

                    setHistoryData(prev => {
                        const imageData = { url, file, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight };
                        const currentState = prev.history[prev.index];
                        let newHistory;

                        if (imageType === 'product' && mode !== 'ai-model') {
                            const newInitialState: HistoryState = { ...initialHistoryState, productImage: imageData };
                            newHistory = [newInitialState];
                            setUploadKey(k => k + 1);
                        } else {
                            const newImages = { ...currentState.generatedImages };
                            if (mode === 'ai-model' && (imageType === 'model' || imageType === 'product')) {
                                newImages['ai-model'] = { ...currentState.generatedImages['ai-model'], [modelSource]: null };
                            }
                            
                            const newEntry: HistoryState = {
                                ...currentState,
                                generatedImages: newImages,
                                productImage: imageType === 'product' ? imageData : currentState.productImage,
                                modelImage: imageType === 'model' ? imageData : currentState.modelImage,
                            };
                            newHistory = [...prev.history.slice(0, prev.index + 1), newEntry];
                        }

                        return {
                            history: newHistory,
                            index: newHistory.length - 1
                        };
                    });
                };
                img.src = url;
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePromptGen = async () => {
        // This is the correct way to handle state in async event handlers.
        // Capture the state at the time of invocation to prevent race conditions
        // if the user switches modes while the async operation is in flight.
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

        if (backgroundStatuses[effectiveSubMode].isLoading) return;
        
        setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { isLoading: 'Generating...', error: null }}));
        
        const subModeSettings = 
            effectiveSubMode === 'color' ? { backgroundColor } :
            effectiveSubMode === 'scene' ? { scenePrompt, aspectRatio } :
            {}; // for transparent

        const settings = { 
            promptOptimizer: promptEnhancer, 
            backgroundSubMode: effectiveSubMode,
            ...subModeSettings,
        };

        try {
            const prepareAspectRatio = effectiveSubMode === 'scene' ? aspectRatio : '1:1';
            const { preparedDataUrl } = await prepareImage(productImage.url, 1024, prepareAspectRatio);
            
            const result = await generateProductShot(preparedDataUrl, settings);
            
            let finalImage = result;
            if (effectiveSubMode !== 'scene') {
                finalImage = await cropImage(result, productImage.originalWidth, productImage.originalHeight);
            }

            pushHistoryState('background', effectiveSubMode, finalImage);
        } catch (err) {
            setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { isLoading: '', error: err instanceof Error ? err.message : 'An unknown error occurred.' }}));
        } finally {
            setBackgroundStatuses(prev => ({ ...prev, [effectiveSubMode]: { ...prev[effectiveSubMode], isLoading: '' }}));
        }
    };
    
    const handleAiModelGenerate = async () => {
        // Capture state at invocation time to prevent race conditions.
        const invokedModelSource = modelSource;

        if (aiModelStatuses[invokedModelSource].isLoading) return;
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
            
            pushHistoryState('ai-model', invokedModelSource, result);
        } catch (err) {
            setAiModelStatuses(prev => ({ ...prev, [invokedModelSource]: { isLoading: '', error: err instanceof Error ? err.message : 'An unknown error occurred.' }}));
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
        return initialOpStatus; // Fallback
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

    const showAdvancedSettings = (mode === 'background' && backgroundSubMode === 'scene') || mode === 'ai-model';
    
    const currentGeneratedImage = useMemo(() => {
        if (mode === 'background') {
            const isTransparent = backgroundSubMode === 'color' && backgroundColor === 'transparent';
            const effectiveSubMode = isTransparent ? 'transparent' : backgroundSubMode;
            return generatedImages.background[effectiveSubMode];
        }
        return generatedImages['ai-model'][modelSource];
    }, [mode, backgroundSubMode, backgroundColor, modelSource, generatedImages]);

    return (
        <div className="bg-neutral-900 text-white min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8 font-roboto">
            <header className="w-full max-w-7xl mb-6">
                <h1 className="text-4xl sm:text-5xl font-permanent-marker text-center text-yellow-400 tracking-wide">
                    Blendify AI
                </h1>
                <p className="text-center text-neutral-400 mt-2">
                    Your AI-powered studio for stunning product photography.
                </p>
            </header>

            <main className="w-full max-w-7xl flex-grow flex flex-col lg:flex-row gap-8">
                {/* --- Main Canvas --- */}
                <div className="w-full lg:w-2/3 h-[50vh] lg:h-auto flex flex-col items-center justify-center bg-black/20 rounded-lg p-4 relative">
                    <HistoryControls 
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onStartOver={handleStartOver}
                    />

                    {currentStatus.isLoading && <LoadingIndicator step={currentStatus.isLoading} />}
                    {currentStatus.error && !currentStatus.isLoading && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-md"><strong>Error:</strong> {currentStatus.error}</div>}
                    
                    {!currentStatus.isLoading && !currentStatus.error && (
                        <>
                        {currentGeneratedImage ? (
                             <GenerationResult src={currentGeneratedImage} alt="Generated result" />
                        ) : productImage.url && (mode === 'background' || (mode === 'ai-model' && productImage.url)) ? (
                            <img src={productImage.url} alt="Product preview" className="max-w-full max-h-full object-contain rounded-md" />
                        ) : (
                            <div className="text-center text-neutral-500">
                                <h2 className="text-2xl font-permanent-marker">
                                    {mode === 'ai-model' ? 'AI Model Canvas' : 'Upload a Product to Begin'}
                                </h2>
                                <p>
                                     {mode === 'ai-model' ? 'Use the controls on the right to generate an image.' : 'Your creative studio awaits.'}
                                </p>
                            </div>
                        )}
                        </>
                    )}
                </div>

                {/* --- Control Sidebar --- */}
                <aside className="w-full lg:w-1/3 flex flex-col">
                     {/* Scrollable Settings Area */}
                    <div className="lg:flex-grow lg:overflow-y-auto lg:pr-2 space-y-4">
                        <div className={panelStyles}>
                            <label className={labelStyles}>Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                <ModeButton icon={<BackgroundIcon/>} label="Background" isActive={mode === 'background'} onClick={() => setMode('background')} />
                                <ModeButton icon={<AiModelIcon/>} label="AI Model" isActive={mode === 'ai-model'} onClick={() => setMode('ai-model')} />
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
                                        <div className="flex bg-black/20 rounded-md p-1">
                                            <button onClick={() => setBackgroundSubMode('color')} className={`w-1/2 rounded py-2 text-sm font-bold transition-colors ${backgroundSubMode === 'color' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>Color</button>
                                            <button onClick={() => setBackgroundSubMode('scene')} className={`w-1/2 rounded py-2 text-sm font-bold transition-colors ${backgroundSubMode === 'scene' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>AI Scene</button>
                                        </div>
                                        <div className="relative">
                                            <AnimatePresence mode="wait" initial={false}>
                                                <motion.div
                                                    key={backgroundSubMode}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    {backgroundSubMode === 'color' && (
                                                        <div className="space-y-4">
                                                            <label className={labelStyles + " uppercase"}>Background Color</label>
                                                            <div className="flex items-center gap-3 w-full bg-black/40 border border-white/20 rounded-lg p-2 focus-within:ring-2 focus-within:ring-yellow-400 transition-shadow">
                                                                <label htmlFor="color-picker" className="relative w-9 h-9 rounded-md cursor-pointer shrink-0 border border-white/20">
                                                                    <div 
                                                                        className="w-full h-full rounded-sm"
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
                                                            <div className="grid grid-cols-6 gap-4 justify-items-center">
                                                                <div className="relative">
                                                                    {backgroundColor === 'transparent' && <motion.div layoutId="active-color-ring" className="absolute inset-[-4px] ring-2 ring-yellow-400 rounded-full" transition={{ type: 'spring', stiffness: 500, damping: 30 }} />}
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
                                                                        {backgroundColor === swatch && <motion.div layoutId="active-color-ring" className="absolute inset-[-4px] ring-2 ring-yellow-400 rounded-full" transition={{ type: 'spring', stiffness: 500, damping: 30 }} />}
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
                                                    )}
                                                    {backgroundSubMode === 'scene' && (
                                                        <div className="space-y-4">
                                                            <div>
                                                                <label className={labelStyles}>Aspect Ratio</label>
                                                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                                                    {['9:16', '4:5', '3:4', '1:1', '16:9', '4:3'].map(ar => (
                                                                        <button
                                                                            key={ar}
                                                                            onClick={() => setAspectRatio(ar)}
                                                                            className={`flex items-center justify-center p-2 rounded-md transition-colors duration-200 text-xs h-10 font-bold ${aspectRatio === ar ? 'bg-yellow-400 text-black' : 'bg-black/20 hover:bg-white/10'}`}
                                                                        >
                                                                            {ar}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label htmlFor="scene-prompt" className={labelStyles}>Scene Prompt</label>
                                                                <div className="relative">
                                                                    <textarea id="scene-prompt" value={scenePrompt} onChange={(e) => setScenePrompt(e.target.value)} placeholder="e.g., on a marble countertop next to a plant" rows={3} className={`${inputStyles} pr-12`} />
                                                                    <button onClick={handlePromptGen} disabled={isScenePromptLoading || !productImage.url || !!backgroundStatuses.scene.isLoading} title="Generate prompt from product image" className="absolute top-2 right-2 p-1 text-yellow-400 bg-black/20 rounded-md h-8 w-8 flex items-center justify-center hover:bg-white/10 disabled:text-neutral-500 disabled:cursor-not-allowed">
                                                                        {isScenePromptLoading ? <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div> : <GenIcon />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                    </>
                                )}
                                {mode === 'ai-model' && (
                                    <>
                                        <div className={panelStyles}>
                                            <label className={labelStyles}>Model Source</label>
                                            <div className="flex bg-black/20 rounded-md p-1">
                                                <button onClick={() => setModelSource('ai')} className={`w-1/2 rounded py-2 text-sm font-bold transition-colors ${modelSource === 'ai' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>AI Generated</button>
                                                <button onClick={() => setModelSource('custom')} className={`w-1/2 rounded py-2 text-sm font-bold transition-colors ${modelSource === 'custom' ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>Your Model</button>
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
                                                    className="absolute top-2 right-2 p-1 text-yellow-400 bg-black/20 rounded-md h-8 w-8 flex items-center justify-center hover:bg-white/10 disabled:text-neutral-500 disabled:cursor-not-allowed"
                                                >
                                                    {isAiModelPromptLoading[modelSource] ? <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div> : <GenIcon />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className={panelStyles}>
                                            <h3 className={labelStyles}>Creative Controls</h3>
                                            <div className="grid grid-cols-1 gap-4">
                                                <div>
                                                    <label className={labelStyles}>Aspect Ratio</label>
                                                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                                        {['9:16', '4:5', '3:4', '1:1', '16:9', '4:3'].map(ar => (
                                                            <button
                                                                key={ar}
                                                                onClick={() => setAspectRatio(ar)}
                                                                className={`flex items-center justify-center p-2 rounded-md transition-colors duration-200 text-xs h-10 font-bold ${aspectRatio === ar ? 'bg-yellow-400 text-black' : 'bg-black/20 hover:bg-white/10'}`}
                                                            >
                                                                {ar}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {modelSource === 'ai' && (
                                                <div>
                                                    <label className={labelStyles + ' text-xs text-neutral-400 mb-1'}>Gender</label>
                                                    <div className="flex bg-black/20 rounded-md p-1">
                                                        {(['Any', 'Male', 'Female'] as Gender[]).map(g => (
                                                            <button key={g} onClick={() => setGender(g)} className={`w-1/3 rounded py-2 text-sm font-bold transition-colors ${gender === g ? 'bg-yellow-400 text-black' : 'hover:bg-white/10'}`}>{g}</button>
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
                                            </div>
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        </AnimatePresence>
                        
                        {showAdvancedSettings && (
                            <div className={panelStyles}>
                                <div className="flex flex-col items-start gap-2">
                                    <div className="flex items-center">
                                        <label htmlFor="optimizer" className={labelStyles + ' mb-0'}>Enhancer</label>
                                        <div className="relative group ml-2"><InfoIcon className="cursor-help" />
                                            <div className="absolute bottom-full mb-2 w-48 bg-neutral-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none -translate-x-1/2 left-1/2">
                                                Enhances your prompt with professional terms for better results.
                                            </div>
                                        </div>
                                    </div>
                                    <label htmlFor="optimizer-toggle" className="flex items-center cursor-pointer">
                                    <div className="relative">
                                        <input 
                                            type="checkbox" 
                                            id="optimizer-toggle" 
                                            className="sr-only" 
                                            checked={mode === 'ai-model' ? (modelSource === 'ai' ? aiGeneratedPromptEnhancer : yourModelPromptEnhancer) : promptEnhancer} 
                                            onChange={() => {
                                                if (mode === 'ai-model') {
                                                    if (modelSource === 'ai') {
                                                        setAiGeneratedPromptEnhancer(!aiGeneratedPromptEnhancer);
                                                    } else {
                                                        setYourModelPromptEnhancer(!yourModelPromptEnhancer);
                                                    }
                                                } else {
                                                    setPromptEnhancer(!promptEnhancer);
                                                }
                                            }} 
                                        />
                                        <div className={`block w-14 h-8 rounded-full transition-colors ${(mode === 'ai-model' ? (modelSource === 'ai' ? aiGeneratedPromptEnhancer : yourModelPromptEnhancer) : promptEnhancer) ? 'bg-yellow-800' : 'bg-black/20'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${(mode === 'ai-model' ? (modelSource === 'ai' ? aiGeneratedPromptEnhancer : yourModelPromptEnhancer) : promptEnhancer) ? 'transform translate-x-full bg-yellow-400' : ''}`}></div>
                                    </div>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                
                    {/* Sticky Generate Button */}
                    <div className="mt-auto pt-4">
                        <button onClick={handleGenerateClick} disabled={!canGenerate} className={primaryButtonClasses + ' w-full'}>
                            {currentStatus.isLoading ? 'Generating...' : 'Generate'}
                        </button>
                    </div>
                </aside>
            </main>
        </div>
    );
}

const ModeButton = ({ icon, label, isActive, onClick, isDisabled = false }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isDisabled?: boolean }) => (
    <button
        onClick={onClick}
        disabled={isDisabled}
        className={`flex flex-col items-center justify-center p-3 rounded-md transition-colors duration-200 text-sm h-full ${isActive ? 'bg-yellow-400 text-black' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
        {icon}
        <span className="mt-1 font-bold tracking-wider">{label}</span>
    </button>
);