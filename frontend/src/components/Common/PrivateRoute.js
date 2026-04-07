import React from "react";
import { Navigate, Outlet } from "react-router-dom";

const PrivateRoute = ({ roles }) => {
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  const userRole = localStorage.getItem("userRole");

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  // If roles are provided, check if the user's role is allowed
  if (roles && !roles.includes(userRole)) {
    return <Navigate to="/unauthorized" />;
  }
  
  return <Outlet />;
};

export default PrivateRoute;