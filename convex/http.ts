import { httpRouter } from "convex/server";
import { paymentWebhook } from "./subscriptions";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

// Helper function to calculate if a place is open now based on opening hours periods
function calculateIsOpenNow(periods: any[]): boolean | undefined {
  if (!periods || periods.length === 0) {
    return undefined;
  }
  
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentTime = now.getHours() * 100 + now.getMinutes(); // HHMM format
  
  // Find today's period (Google uses 0 = Sunday, 1 = Monday, etc.)
  const todayPeriod = periods.find((p: any) => p.open?.day === currentDay);
  
  if (!todayPeriod || !todayPeriod.open) {
    return false; // Closed today
  }
  
  const openTime = parseInt(todayPeriod.open.time, 10); // HHMM format (e.g., "0900")
  const closeTime = todayPeriod.close 
    ? parseInt(todayPeriod.close.time, 10)
    : 2359; // If no close time, assume open until end of day
  
  // Handle overnight hours (e.g., open until 2 AM)
  if (closeTime < openTime) {
    // Place closes after midnight
    return currentTime >= openTime || currentTime < closeTime;
  } else {
    // Normal hours
    return currentTime >= openTime && currentTime < closeTime;
  }
}

// Genre mapping function to convert Google Places categories and names to simple genres
function mapCategoryToGenre(types: string[], name: string): string {
  const nameLower = name.toLowerCase();
  
  // Keyword-based genre detection from restaurant name
  const genreKeywords: Record<string, string> = {
    // Mexican
    mexican: "mexican",
    taco: "mexican",
    burrito: "mexican",
    quesadilla: "mexican",
    enchilada: "mexican",
    chipotle: "mexican",
    "el ": "mexican",
    "la ": "mexican",
    cantina: "mexican",
    
    // Italian
    italian: "italian",
    pizza: "pizza",
    pasta: "italian",
    trattoria: "italian",
    ristorante: "italian",
    "olive garden": "italian",
    
    // Chinese
    chinese: "chinese",
    "panda express": "chinese",
    "dim sum": "chinese",
    wok: "chinese",
    "pf chang": "chinese",
    
    // Japanese
    japanese: "japanese",
    sushi: "japanese",
    ramen: "japanese",
    teriyaki: "japanese",
    hibachi: "japanese",
    
    // Fast Food
    mcdonald: "fast-food",
    burger: "fast-food",
    "burger king": "fast-food",
    wendy: "fast-food",
    "taco bell": "fast-food",
    subway: "fast-food",
    "kfc": "fast-food",
    "kentucky fried": "fast-food",
    "dunkin": "fast-food",
    "domino": "fast-food",
    "papa john": "fast-food",
    "little caesar": "fast-food",
    "pizza hut": "fast-food",
    
    // Steak
    steak: "steak",
    "steakhouse": "steak",
    "outback": "steak",
    "texas roadhouse": "steak",
    "longhorn": "steak",
    
    // BBQ
    barbecue: "bbq",
    bbq: "bbq",
    "bar-b-q": "bbq",
    "barbeque": "bbq",
    smokehouse: "bbq",
    
    // Seafood
    seafood: "seafood",
    fish: "seafood",
    "red lobster": "seafood",
    "bonefish": "seafood",
    
    // Indian
    indian: "indian",
    curry: "indian",
    tandoor: "indian",
    naan: "indian",
    
    // Thai
    thai: "thai",
    pad: "thai",
    
    // American
    diner: "american",
    grill: "american",
    "applebees": "american",
    "chili": "american",
    "tgi friday": "american",
    
    // French
    french: "french",
    bistro: "french",
    brasserie: "french",
  };

  // Check restaurant name for keywords
  for (const [keyword, genre] of Object.entries(genreKeywords)) {
    if (nameLower.includes(keyword)) {
      return genre;
    }
  }

  // Check types array for specific indicators
  const typesLower = types.map(t => t.toLowerCase());
  
  // Check for specific restaurant cuisine types from Google Places API
  const cuisineTypeMap: Record<string, string> = {
    mexican_restaurant: "mexican",
    italian_restaurant: "italian",
    chinese_restaurant: "chinese",
    japanese_restaurant: "japanese",
    indian_restaurant: "indian",
    thai_restaurant: "thai",
    french_restaurant: "french",
    seafood_restaurant: "seafood",
    steak_house: "steak",
    barbecue_restaurant: "bbq",
    pizza_restaurant: "pizza",
    american_restaurant: "american",
    mediterranean_restaurant: "mediterranean",
    greek_restaurant: "greek",
    korean_restaurant: "korean",
    vietnamese_restaurant: "vietnamese",
    middle_eastern_restaurant: "middle-eastern",
    latin_american_restaurant: "latin",
    caribbean_restaurant: "caribbean",
    soul_food_restaurant: "soul-food",
    southern_restaurant: "southern",
    cajun_restaurant: "cajun",
    tex_mex_restaurant: "mexican",
    sushi_restaurant: "japanese",
    ramen_restaurant: "japanese",
    burger_restaurant: "fast-food",
    sandwich_shop: "fast-food",
    fast_food_restaurant: "fast-food",
  };

  // Check for specific cuisine types first
  for (const type of typesLower) {
    if (cuisineTypeMap[type]) {
      return cuisineTypeMap[type];
    }
  }
  
  if (typesLower.includes("meal_takeaway") || typesLower.includes("meal_delivery")) {
    return "fast-food";
  }
  
  if (typesLower.includes("cafe") || typesLower.includes("bakery")) {
    return "cafe";
  }

  // Check for bar/pub indicators
  if (typesLower.includes("bar") || typesLower.includes("pub") || nameLower.includes("bar") || nameLower.includes("tavern")) {
    return "bar";
  }

  // Default fallback
  return "restaurant";
}

export const searchRestaurants = httpAction(async (ctx, req) => {
  const { zipCode } = await req.json();

  if (!zipCode || typeof zipCode !== "string") {
    return new Response(
      JSON.stringify({ error: "Zip code is required" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
        },
      }
    );
  }

  // Check cache first
  const cached = await ctx.runQuery(api.restaurants.getCachedRestaurants, {
    zipCode: zipCode.trim(),
  });

  if (cached && cached.restaurants.length > 0) {
    // Return cached results
    return new Response(
      JSON.stringify({ restaurants: cached.restaurants }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
        },
      }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Google Places API key not configured" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
        },
      }
    );
  }

  try {
    // Use Google Places API Text Search
    const query = `restaurants in ${zipCode}`;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      // Provide more detailed error messages for common issues
      let errorMessage = `Google Places API error: ${data.status}`;
      if (data.status === "REQUEST_DENIED") {
        errorMessage = `Google Places API error: REQUEST_DENIED. This usually means:
1. Places API is not enabled in Google Cloud Console
2. Billing is not enabled on your Google Cloud project
3. API key has restrictions (IP/referrer) blocking the request
4. API key is invalid

Please check: https://console.cloud.google.com/apis/library/places-backend.googleapis.com`;
      } else if (data.error_message) {
        errorMessage += `. ${data.error_message}`;
      }

      console.error("Google Places API error:", {
        status: data.status,
        error_message: data.error_message,
        url: url.replace(apiKey, "***"),
      });

      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
          },
        }
      );
    }

    // Collect all places from all pages
    let allPlaces: any[] = [...(data.results || [])];
    let nextPageToken = data.next_page_token;

    // Fetch additional pages (Google Places API allows up to 3 pages = 60 results)
    // Note: next_page_token requires a short delay before it's valid
    while (nextPageToken && allPlaces.length < 60) {
      // Wait 2 seconds as required by Google Places API for next_page_token
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const nextPageUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${nextPageToken}&key=${apiKey}`;
      const nextPageResponse = await fetch(nextPageUrl);
      const nextPageData = await nextPageResponse.json();
      
      if (nextPageData.status === "OK" && nextPageData.results) {
        allPlaces = [...allPlaces, ...nextPageData.results];
        nextPageToken = nextPageData.next_page_token;
      } else {
        break;
      }
    }

    // Fetch Place Details for opening hours (in parallel batches to avoid rate limits)
    // Process in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    const restaurants = [];
    
    for (let i = 0; i < allPlaces.length; i += batchSize) {
      const batch = allPlaces.slice(i, i + batchSize);
      
      // Fetch Place Details for this batch in parallel
      const placeDetailsPromises = batch.map(async (place: any) => {
        try {
          const placeId = place.place_id;
          if (!placeId) {
            console.warn(`No place_id found for place: ${place.name}`);
            return {
              name: place.name,
              genre: mapCategoryToGenre(place.types || [], place.name || ""),
              priceLevel: place.price_level !== undefined ? place.price_level : undefined,
              isOpen: undefined,
            };
          }
          
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours,current_opening_hours&key=${apiKey}`;
          const detailsResponse = await fetch(detailsUrl);
          const detailsData = await detailsResponse.json();
          
          // Check for API errors
          if (detailsData.status !== "OK") {
            console.warn(`Place Details API error for ${placeId}: ${detailsData.status} - ${detailsData.error_message || "Unknown error"}`);
            return {
              name: place.name,
              genre: mapCategoryToGenre(place.types || [], place.name || ""),
              priceLevel: place.price_level !== undefined ? place.price_level : undefined,
              isOpen: undefined,
            };
          }
          
          // Extract opening hours status
          // Try current_opening_hours first (newer API), then fall back to opening_hours.open_now (deprecated but might still work)
          const result = detailsData.result;
          let isOpen: boolean | undefined = undefined;
          
          if (result?.current_opening_hours?.open_now !== undefined) {
            // New API field
            isOpen = result.current_opening_hours.open_now;
          } else if (result?.opening_hours?.open_now !== undefined) {
            // Legacy field (deprecated but might still be available)
            isOpen = result.opening_hours.open_now;
          } else if (result?.opening_hours?.periods) {
            // Calculate from periods if open_now is not available
            isOpen = calculateIsOpenNow(result.opening_hours.periods);
          }
          
          // Log for debugging if needed
          if (isOpen === undefined && !result?.opening_hours && !result?.current_opening_hours) {
            console.warn(`No opening_hours data for place: ${place.name} (${placeId})`);
          }
          
          return {
            name: place.name,
            genre: mapCategoryToGenre(place.types || [], place.name || ""),
            priceLevel: place.price_level !== undefined ? place.price_level : undefined,
            isOpen: isOpen !== undefined ? isOpen : undefined,
          };
        } catch (error) {
          // If Place Details fails, still return the restaurant without opening hours
          console.error(`Failed to fetch details for place ${place.place_id}:`, error);
          return {
            name: place.name,
            genre: mapCategoryToGenre(place.types || [], place.name || ""),
            priceLevel: place.price_level !== undefined ? place.price_level : undefined,
            isOpen: undefined,
          };
        }
      });
      
      const batchResults = await Promise.all(placeDetailsPromises);
      restaurants.push(...batchResults);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < allPlaces.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Save to database for future use
    if (restaurants.length > 0) {
      await ctx.runMutation(api.restaurants.saveRestaurants, {
        zipCode: zipCode.trim(),
        restaurants,
      });
    }

    return new Response(
      JSON.stringify({ restaurants }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch restaurants" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
        },
      }
    );
  }
});

export const chat = httpAction(async (ctx, req) => {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    messages,
    async onFinish({ text }) {
      // implement your own logic here, e.g. for storing messages
      // or recording token usage
      console.log(text);
    },
  });

  // Respond with the stream
  return result.toDataStreamResponse({
    headers: {
      "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      Vary: "origin",
    },
  });
});

const http = httpRouter();

http.route({
  path: "/api/chat",
  method: "POST",
  handler: chat,
});

http.route({
  path: "/api/chat",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

http.route({
  path: "/api/auth/webhook",
  method: "POST",
  handler: httpAction(async (_, request) => {
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

http.route({
  path: "/payments/webhook",
  method: "POST",
  handler: paymentWebhook,
});

http.route({
  path: "/api/restaurants",
  method: "POST",
  handler: searchRestaurants,
});

http.route({
  path: "/api/restaurants",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": process.env.FRONTEND_URL || "http://localhost:5173",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

// Log that routes are configured
console.log("HTTP routes configured");

// Convex expects the router to be the default export of `convex/http.js`.
export default http;
