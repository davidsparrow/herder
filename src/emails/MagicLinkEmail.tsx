import {
  Body, Button, Container, Head, Heading, Html,
  Preview, Section, Text, Tailwind,
} from "@react-email/components";

interface Props { magicLink: string; email: string; }

export function MagicLinkEmail({ magicLink, email }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your Herder sign-in link — valid for 10 minutes</Preview>
      <Tailwind>
        <Body className="bg-[#FDF8F3] font-sans py-10">
          <Container className="bg-white rounded-2xl max-w-lg mx-auto px-10 py-10 shadow-sm border border-[#EAD9C6]">
            <Heading className="font-bold text-[#2C1810] text-2xl mb-2" style={{ fontFamily: "Georgia, serif" }}>
              🐑 Sign in to Herder
            </Heading>
            <Text className="text-[#8B6355] text-sm mb-6">
              Click the button below to sign in as <strong>{email}</strong>.<br />
              This link expires in 10 minutes and can only be used once.
            </Text>
            <Section className="text-center mb-8">
              <Button
                href={magicLink}
                className="bg-[#E05C2A] text-white font-bold text-base px-8 py-4 rounded-xl no-underline inline-block"
              >
                Sign in to Herder →
              </Button>
            </Section>
            <Text className="text-xs text-[#8B6355]">
              If you didn't request this, you can safely ignore this email. Your account is secure.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default MagicLinkEmail;
