import axios from "axios";

const GOOGLE_PLACES_API_KEY = process.env.REACT_APP_GOOGLE_PLACES_API_KEY || "";
const GOOGLE_PLACES_API_URL =
    "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const GOOGLE_PLACE_DETAILS_URL =
    "https://maps.googleapis.com/maps/api/place/details/json";

/**
 * Get address predictions from Google Places API
 * Handles spelling mistakes and returns formatted addresses
 */
export const getAddressPredictions = async (input) => {
    if (!input || input.trim().length < 3) {
        return [];
    }

    if (!GOOGLE_PLACES_API_KEY) {
        console.warn(
            "Google Places API key not configured. Set REACT_APP_GOOGLE_PLACES_API_KEY in .env",
        );
        return [];
    }

    try {
        const response = await axios.get(GOOGLE_PLACES_API_URL, {
            params: {
                input: input.trim(),
                key: GOOGLE_PLACES_API_KEY,
                components: "country:in", // Prioritize India, can be removed for worldwide
            },
        });

        if (response.data.status === "OK") {
            return response.data.predictions.map((prediction) => ({
                placeId: prediction.place_id,
                mainText: prediction.main_text,
                secondaryText: prediction.secondary_text,
                fullAddress: prediction.description,
            }));
        }

        return [];
    } catch (error) {
        console.error("Error fetching address predictions:", error);
        return [];
    }
};

/**
 * Get detailed information for a selected place
 * Returns full address with coordinates
 */
export const getPlaceDetails = async (placeId) => {
    if (!placeId || !GOOGLE_PLACES_API_KEY) {
        return null;
    }

    try {
        const response = await axios.get(GOOGLE_PLACE_DETAILS_URL, {
            params: {
                place_id: placeId,
                key: GOOGLE_PLACES_API_KEY,
                fields: "formatted_address,geometry,address_components",
            },
        });

        if (response.data.status === "OK") {
            const result = response.data.result;
            return {
                address: result.formatted_address,
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng,
                components: result.address_components || [],
            };
        }

        return null;
    } catch (error) {
        console.error("Error fetching place details:", error);
        return null;
    }
};
