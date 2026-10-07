import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  rightActionText?: string;
  onRightActionPress?: () => void;
  variant?: 'light' | 'dark';
}

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  rightActionText,
  onRightActionPress,
  variant = 'light',
  className,
  style,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const isLight = variant === 'light';

  return (
    <View style={styles.wrapper}>
      {/* Label and optional action header */}
      {(label || rightActionText) && (
        <View style={styles.headerRow}>
          {label && (
            <Text
              style={[
                styles.label,
                { color: isLight ? '#334155' : '#cbd5e1' },
              ]}
            >
              {label}
            </Text>
          )}
          {rightActionText && onRightActionPress && (
            <TouchableOpacity activeOpacity={0.7} onPress={onRightActionPress}>
              <Text
                style={[
                  styles.rightActionText,
                  { color: isLight ? '#2563eb' : '#76F756' },
                ]}
              >
                {rightActionText}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Input container */}
      <View
        style={[
          styles.container,
          isLight ? styles.containerLight : styles.containerDark,
          isFocused && (isLight ? styles.focusedLight : styles.focusedDark),
          !!error && styles.errorBorder,
          style,
        ]}
      >
        {/* Left Icon Slot */}
        {leftIcon && <View style={styles.leftIconWrapper}>{leftIcon}</View>}

        {/* Text Input */}
        <TextInput
          placeholderTextColor={isLight ? '#94a3b8' : '#64748b'}
          style={[
            styles.input,
            { color: isLight ? '#0f172a' : '#ffffff' },
          ]}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          selectionColor={isLight ? '#2563eb' : '#76F756'}
          {...props}
        />

        {/* Right Icon Slot (e.g. Eye icon) */}
        {rightIcon && <View style={styles.rightIconWrapper}>{rightIcon}</View>}
      </View>

      {/* Error text */}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    gap: 7,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  rightActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    minHeight: 52,
    paddingHorizontal: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  containerLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  containerDark: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
  },
  focusedLight: {
    borderColor: '#0f172a',
    backgroundColor: '#ffffff',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  focusedDark: {
    borderColor: '#76F756',
    backgroundColor: '#18181b',
    ...Platform.select({
      ios: {
        shadowColor: '#76F756',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.20,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  errorBorder: {
    borderColor: '#ef4444',
    backgroundColor: '#fff5f5',
  },
  leftIconWrapper: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightIconWrapper: {
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 4,
    marginTop: 2,
  },
});
