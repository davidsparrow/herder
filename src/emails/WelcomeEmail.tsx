import {
  Body, Container, Head, Heading, Html, Preview, Text, Tailwind, Section, Button,
} from "@react-email/components";

interface Props { name: string; }

export function WelcomeEmail({ name }: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://herder.app";
  return (
    <Html>
      <Head />
      <Preview>Welcome to Herder — you’re on the Free plan!</Preview>
      <Tailwind>
        <Body className="bg-[#FDF8F3] font-sans py-10">
          <Container className="bg-white rounded-2xl max-w-lg mx-auto px-10 py-10 shadow-sm border border-[#EAD9C6]">
            <Heading className="font-bold text-[#2C1810] text-2xl mb-2" style={{ fontFamily: "Georgia, serif" }}>
              Welcome to Herder, {name || "friend"}! 🐑
            </Heading>
            <Text className="text-[#5C3D2E] text-sm mb-4 leading-relaxed">
              You’re all set on the <strong>Free plan</strong> — you can create up to 3 check-in lists with up to 20 names each. No credit card needed.
            </Text>
            <Text className="text-[#8B6355] text-sm mb-6 leading-relaxed">
              To get started, upload a photo of your roster or drag in a spreadsheet. Herder will extract every name and have you live in under 30 seconds.
            </Text>
            <Section className="text-center mb-8">
              <Button
                href={`${appUrl}/dashboard`}
                className="bg-[#E05C2A] text-white font-bold text-base px-8 py-4 rounded-xl no-underline inline-block"
              >
                Go to my dashboard →
              </Button>
            </Section>
            <Text className="text-xs text-[#8B6355]">
              Questions? Reply to this email — we read every one.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default WelcomeEmail;
