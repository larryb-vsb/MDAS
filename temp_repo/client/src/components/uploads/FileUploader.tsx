import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
}

export default function FileUploader({ onFilesSelected }: FileUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesSelected(acceptedFiles);
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  return (
    <div
      {...getRootProps()}
      className={`p-6 mt-5 border-2 border-dashed rounded-md ${
        isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
      }`}
    >
      <div className="flex justify-center">
        <div className="space-y-1 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <div className="flex text-sm text-gray-600">
            <label
              htmlFor="file-upload"
              className="relative font-medium text-blue-600 bg-white rounded-md cursor-pointer hover:text-blue-500 focus-within:outline-none"
            >
              <span>Upload files</span>
              <input {...getInputProps()} className="sr-only" />
            </label>
            <p className="pl-1">or drag and drop</p>
          </div>
          <p className="text-xs text-gray-500">CSV files up to 10MB</p>
        </div>
      </div>
    </div>
  );
}
