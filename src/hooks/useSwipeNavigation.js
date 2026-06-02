import { useRef } from "react";
import { PanResponder } from "react-native";

// Tab order must match AppNavigator bottom tab order
const TAB_ORDER = ["Home", "Enquiry", "FollowUp", "Communication", "Report"];

/**
 * useSwipeNavigation
 * Returns panHandlers that can be spread onto the root <View> of a tab screen.
 * Swipe LEFT  → navigate to the next tab
 * Swipe RIGHT → navigate to the previous tab
 *
 * @param {string} currentTab  - Name of the current tab (must be in TAB_ORDER)
 * @param {object} navigation  - React Navigation navigation prop
 */
function useSwipeNavigation(currentTab, navigation) {
    const panResponder = useRef(
        PanResponder.create({
            // Do NOT steal the touch at the initial press (allows button presses)
            onStartShouldSetPanResponder: () => false,
            onStartShouldSetPanResponderCapture: () => false,

            // Steal the gesture only when horizontal movement is significantly
            // greater than vertical → i.e., the user is clearly swiping sideways.
            onMoveShouldSetPanResponder: (_, gestureState) => {
                const { dx, dy } = gestureState;
                return Math.abs(dx) > Math.abs(dy) * 2.5 && Math.abs(dx) > 15;
            },
            onMoveShouldSetPanResponderCapture: () => false,

            onPanResponderRelease: (_, gestureState) => {
                const { dx, vx } = gestureState;
                const currentIndex = TAB_ORDER.indexOf(currentTab);
                if (currentIndex === -1) return;

                const isSwipeLeft = dx < -60 || vx < -0.4;
                const isSwipeRight = dx > 60 || vx > 0.4;

                if (isSwipeLeft && currentIndex < TAB_ORDER.length - 1) {
                    // Go to next tab
                    navigation.navigate(TAB_ORDER[currentIndex + 1]);
                } else if (isSwipeRight && currentIndex > 0) {
                    // Go to previous tab
                    navigation.navigate(TAB_ORDER[currentIndex - 1]);
                }
            },
        }),
    ).current;

    return panResponder.panHandlers;
}

export { useSwipeNavigation };
export default useSwipeNavigation;
