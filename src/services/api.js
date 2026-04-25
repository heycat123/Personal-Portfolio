// src/services/api.js

const API_BASE_URL = 'https://api.yourportfolio.com/cluster'; // Change to http://localhost:3000 for local dev

export const deployService = async (techStack) => {
    try {
        const response = await fetch(`${API_BASE_URL}/deploy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ service: techStack }),
        });

        if (!response.ok) throw new Error(`Failed to deploy ${techStack}`);
        return await response.json();
    } catch (error) {
        console.error("Deployment Error:", error);
        throw error;
    }
};

export const purgeCluster = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/purge`, {
            method: 'DELETE',
        });

        if (!response.ok) throw new Error("Failed to purge cluster");
        return await response.json();
    } catch (error) {
        console.error("Purge Error:", error);
        throw error;
    }
};