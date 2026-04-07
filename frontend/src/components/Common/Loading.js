import React from 'react';

const Loading = () => {
  return (
    <div className="flex justify-center items-center h-full min-h-[50vh]">
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Loading...</p>
      </div>
    </div>
  );
};

export default Loading;