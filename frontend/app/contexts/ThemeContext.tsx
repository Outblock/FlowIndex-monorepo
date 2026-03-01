import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
    theme: 'dark',
    toggleTheme: (_e?: any) => Promise.resolve(),
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Keep SSR and initial client render deterministic to avoid hydration mismatch.
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const saved = window.localStorage.getItem('theme');
        setTheme(saved === 'light' ? 'light' : 'dark');
        setReady(true);
    }, []);

    useEffect(() => {
        if (!ready) return;
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme, ready]);

    const toggleTheme = async (e?: React.MouseEvent) => {
        // Fallback if View Transition API not supported or no coordinates
        if (!document.startViewTransition || !e?.clientX || !e?.clientY) {
            setTheme(prev => prev === 'dark' ? 'light' : 'dark');
            return;
        }

        const x = e.clientX;
        const y = e.clientY;
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y),
        );

        const transition = document.startViewTransition(() => {
            setTheme(prev => prev === 'dark' ? 'light' : 'dark');
        });

        await transition.ready;

        // Animate the new view as an expanding circle from click position
        document.documentElement.animate(
            {
                clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
            },
            {
                duration: 800,
                easing: 'ease-in-out',
                pseudoElement: '::view-transition-new(root)',
            },
        );
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
    return useContext(ThemeContext);
}
