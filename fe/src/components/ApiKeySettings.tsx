import React, { useState, useEffect } from 'react';

interface ApiKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onApiKeyChange: (apiKey: string | null) => void;
}

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ isOpen, onClose, onApiKeyChange }) => {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Storage key for API key
  const API_KEY_STORAGE_KEY = 'user-openai-api-key';

  // Load API key from localStorage on component mount
  useEffect(() => {
    try {
      const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedApiKey) {
        setApiKey(storedApiKey);
        setValidationMessage({ type: 'info', message: 'Using your saved API key' });
      }
    } catch (error) {
      console.error('Failed to load API key from storage:', error);
    }
  }, []);

  const handleSaveApiKey = async () => {
    setIsSaving(true);
    try {
      if (apiKey.trim()) {
        localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
        onApiKeyChange(apiKey.trim());
        
        // Test the API key with the backend
        try {
          const response = await fetch('/api/chat/test-api-key', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userApiKey: apiKey.trim() }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            setValidationMessage({ type: 'success', message: 'API key saved and validated successfully!' });
          } else {
            setValidationMessage({ type: 'error', message: data.error || 'API key validation failed' });
          }
        } catch (error) {
          // Even if validation fails, still save the key
          setValidationMessage({ type: 'success', message: 'API key saved (validation skipped due to network error)' });
        }
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        onApiKeyChange(null);
        setValidationMessage({ type: 'info', message: 'API key removed.' });
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      setValidationMessage({ type: 'error', message: 'Failed to save API key' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveApiKey = () => {
    setApiKey('');
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    onApiKeyChange(null);
    setValidationMessage({ type: 'info', message: 'API key removed.' });
  };

  const handleClose = () => {
    setValidationMessage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🔑</span>
              <h2 className="text-xl font-bold">OpenAI API Key Settings</h2>
            </div>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-200 transition-colors p-1 rounded-full hover:bg-white/10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info Section */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <span className="text-amber-500 text-lg">⚠️</span>
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-2">OpenAI API Key Required</p>
                <ul className="space-y-1 text-amber-700">
                  <li>• An OpenAI API key is required to use chat, document upload, and email features</li>
                  <li>• Your key is stored securely in your browser only</li>
                  <li>• You control your own OpenAI usage and costs</li>
                  <li>• Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-600">OpenAI Platform</a></li>
                </ul>
              </div>
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-3">
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">
              OpenAI API Key
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent pr-12 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showApiKey ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Validation Message */}
          {validationMessage && (
            <div className={`p-3 rounded-lg border ${
              validationMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
              validationMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
              'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <div className="flex items-center space-x-2">
                <span>
                  {validationMessage.type === 'success' ? '✅' :
                   validationMessage.type === 'error' ? '❌' : 'ℹ️'}
                </span>
                <span className="text-sm font-medium">{validationMessage.message}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={handleSaveApiKey}
              disabled={isSaving}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-indigo-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 font-medium transition-all duration-200"
            >
              {isSaving ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Saving & Testing...</span>
                </div>
              ) : (
                'Save API Key'
              )}
            </button>
            {apiKey && (
              <button
                onClick={handleRemoveApiKey}
                className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 font-medium transition-colors"
              >
                Remove Key
              </button>
            )}
            <button
              onClick={handleClose}
              className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySettings; 