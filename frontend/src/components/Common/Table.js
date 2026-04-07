import React from 'react';

const Table = ({ title, columns, children, loading, emptyMessage = "No records found." }) => {
  return (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow-md mb-6 overflow-x-auto">
      {title && <h2 className="text-xl font-semibold mb-4">{title}</h2>}
      
      {loading ? (
        <p className="text-center py-4 text-blue-600">Loading...</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col, index) => (
                <th key={index} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {!children || React.Children.count(children) === 0 ? (
                 <tr><td colSpan={columns.length} className="text-center py-4 text-gray-500">{emptyMessage}</td></tr>
            ) : (
                children
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Table;